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
}

export async function listUsersByRole(roleId: string): Promise<Auth0FellowUser[]> {
  const response = await management.roles.getUsers({
    id: roleId,
    per_page: 100,
    page: 0,
  });

  return (response.data || []).map((u) => ({
    user_id: u.user_id,
    email: u.email,
    name: u.name,
  }));
}
