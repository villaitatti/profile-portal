import { ManagementClient, AuthenticationClient } from 'auth0';
import { env } from '../env.js';
import { randomBytes } from 'crypto';

const management = new ManagementClient({
  domain: env.AUTH0_DOMAIN,
  clientId: env.AUTH0_M2M_CLIENT_ID,
  clientSecret: env.AUTH0_M2M_CLIENT_SECRET,
  timeoutDuration: 10_000,
});

const authentication = new AuthenticationClient({
  domain: env.AUTH0_DOMAIN,
  clientId: env.AUTH0_M2M_CLIENT_ID,
  clientSecret: env.AUTH0_M2M_CLIENT_SECRET,
  timeoutDuration: 10_000,
});

export interface Auth0User {
  user_id: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

export interface Auth0Role {
  id: string;
  name: string;
  description?: string;
}

export async function findUserByEmail(email: string): Promise<Auth0User | null> {
  const response = await management.usersByEmail.getByEmail({
    email: email.toLowerCase(),
  });

  const users = response.data;
  if (!users || users.length === 0) return null;

  // Find user in the database connection
  const dbUser = users.find((u) =>
    u.identities?.some((i) => i.connection === env.AUTH0_CONNECTION)
  );

  return (dbUser as Auth0User) || null;
}

export async function createUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  civicrmId: number;
}): Promise<Auth0User> {
  // Generate a strong random password the user will never know
  const tempPassword = randomBytes(32).toString('base64url') + '!Aa1';

  const response = await management.users.create({
    connection: env.AUTH0_CONNECTION,
    email: params.email,
    password: tempPassword,
    given_name: params.firstName,
    family_name: params.lastName,
    name: `${params.firstName} ${params.lastName}`,
    app_metadata: {
      civicrm_id: String(params.civicrmId),
    },
    email_verified: false,
  });

  return response.data as Auth0User;
}

export async function assignFellowsRole(userId: string): Promise<void> {
  await management.users.assignRoles(
    { id: userId },
    { roles: [env.AUTH0_FELLOWS_ROLE_ID] }
  );
}

/** Role ids currently assigned to a user. Used to detect half-provisioned accounts. */
export async function getUserRoleIds(userId: string): Promise<string[]> {
  const response = await management.users.getRoles({ id: userId });
  return (response.data || []).map((r) => r.id!).filter(Boolean);
}

/**
 * Assign the fellows role only if it is missing.
 *
 * The claim flow creates the Auth0 user and assigns this role in two separate
 * Management API calls. An error between them (a 429 that outlives the SDK's
 * retries, a 5xx) leaves an account that can authenticate but holds no role, and
 * the claim entry point short-circuits on "user already exists" — so a retry
 * would send another password reset and never repair the role. Making the repair
 * idempotent lets the ordinary retry path heal the account.
 *
 * Returns true when a repair was performed.
 */
export async function ensureFellowsRole(userId: string): Promise<boolean> {
  const roleIds = await getUserRoleIds(userId);
  if (roleIds.includes(env.AUTH0_FELLOWS_ROLE_ID)) return false;
  await assignFellowsRole(userId);
  return true;
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  await management.users.assignRoles({ id: userId }, { roles: [roleId] });
}

export async function removeRole(userId: string, roleId: string): Promise<void> {
  await management.users.deleteRoles({ id: userId }, { roles: [roleId] });
}

export async function triggerPasswordSetupEmail(email: string): Promise<void> {
  await authentication.database.changePassword({
    email,
    connection: env.AUTH0_CONNECTION,
  });
}

export async function listRoles(): Promise<Auth0Role[]> {
  const response = await management.roles.getAll();
  return (response.data || []).map((r) => ({
    id: r.id!,
    name: r.name!,
    description: r.description,
  }));
}

export interface Auth0FellowUser {
  user_id: string;
  email: string;
  name?: string;
  civicrmId?: string;
}

export async function listUsersByRole(roleId: string): Promise<Auth0FellowUser[]> {
  // Step 1: get user IDs from the role, using CHECKPOINT pagination (from/take)
  // rather than offset pagination (page/per_page).
  //
  // Auth0 rejects offset pagination on this endpoint once page * per_page
  // exceeds 1000 records. The fellows role is append-only across cohorts, so the
  // previous page-based loop was a guaranteed future cliff: the moment the role
  // passed 1000 members, the request for page 10 would start returning 400 and
  // take the dashboard, the claim ladder, bio-email eligibility and the
  // Atlassian sync dry-run down with it. Checkpoint pagination has no such cap.
  const roleUsers: { user_id: string; email: string; name?: string }[] = [];
  const take = 100;
  let from: string | undefined;

  // Belt-and-braces bound. `next` should terminate on its own; this stops a
  // malformed response from looping forever.
  const maxPages = 1000;
  for (let fetched = 0; fetched < maxPages; fetched++) {
    // The SDK's generated types model only the array and include_totals shapes,
    // not the checkpoint shape ({ users, next }), so read it structurally.
    const response = (await management.roles.getUsers({
      id: roleId,
      take,
      ...(from ? { from } : {}),
    })) as unknown as {
      data:
        | Array<{ user_id: string; email: string; name?: string }>
        | { users?: Array<{ user_id: string; email: string; name?: string }>; next?: string };
    };

    const payload = response.data;
    const users = Array.isArray(payload) ? payload : payload?.users ?? [];
    const next = Array.isArray(payload) ? undefined : payload?.next;

    roleUsers.push(
      ...users.map((u) => ({
        user_id: u.user_id,
        email: u.email,
        name: u.name,
      }))
    );

    // No continuation token, or a short page, means we've seen everything.
    if (!next || users.length === 0) break;
    from = next;
  }

  // Step 2: fetch app_metadata for these users in batches
  const appMetadataMap = new Map<string, string | undefined>();

  for (let i = 0; i < roleUsers.length; i += 50) {
    const batch = roleUsers.slice(i, i + 50);
    const userIds = batch.map((u) => `"${u.user_id}"`).join(' OR ');
    const response = await management.users.getAll({
      q: `user_id:(${userIds})`,
      fields: 'user_id,app_metadata',
      include_fields: true,
      per_page: 50,
      page: 0,
    });

    for (const u of response.data || []) {
      const meta = u.app_metadata as Record<string, unknown> | undefined;
      appMetadataMap.set(u.user_id!, meta?.civicrm_id ? String(meta.civicrm_id) : undefined);
    }
  }

  return roleUsers.map((u) => ({
    ...u,
    civicrmId: appMetadataMap.get(u.user_id),
  }));
}
