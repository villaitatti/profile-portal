import { EventEmitter } from 'events';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { listUsersByRole } from './auth0.service.js';
import * as scim from './atlassian-scim.service.js';
import type { ScimUser, ScimGroup } from './atlassian-scim.service.js';
import type { RoleGroupMapping } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────────────

export interface SyncDiff {
  usersToCreate: { email: string; name: string; givenName: string; familyName: string; auth0UserId: string }[];
  usersToUpdate: { email: string; atlassianId: string; changes: Record<string, { from: string; to: string }> }[];
  usersToReactivate: { email: string; name: string; atlassianId: string }[];
  usersToDeactivate: { email: string; name: string; atlassianId: string }[];
  groupsToCreate: { name: string; mappedFromRole: string }[];
  membershipChanges: { action: 'add' | 'remove'; userEmail: string; groupName: string; groupId: string | null; userScimId: string | null; reason: string }[];
}

export interface SyncOperation {
  seq: number;
  type: string;
  target: string;
  group?: string;
  status: 'success' | 'error' | 'skipped';
  atlassianId?: string;
  error?: string;
  description: string;
}

export interface SyncProgress {
  phase: string;
  step: number;
  totalSteps: number;
  percentage: number;
  description: string;
  status?: string;
}

// ── Desired state (Auth0) ──────────────────────────────────────────

interface DesiredUser {
  auth0UserId: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  roles: string[]; // auth0 role IDs
}

async function fetchDesiredState(
  mappings: RoleGroupMapping[],
  emitter: EventEmitter
): Promise<Map<string, DesiredUser>> {
  const users = new Map<string, DesiredUser>();

  // Dedupe by auth0RoleId — multiple mappings can share a role (one role → many groups)
  const uniqueRoles = new Map<string, string>(); // roleId → roleName
  for (const m of mappings) {
    if (!uniqueRoles.has(m.auth0RoleId)) {
      uniqueRoles.set(m.auth0RoleId, m.auth0RoleName);
    }
  }

  const roleEntries = [...uniqueRoles.entries()];
  for (let i = 0; i < roleEntries.length; i++) {
    const [roleId, roleName] = roleEntries[i];
    emitter.emit('progress', {
      phase: 'fetch_auth0',
      step: i + 1,
      totalSteps: roleEntries.length,
      percentage: Math.round(((i + 1) / roleEntries.length) * 30),
      description: `Fetching Auth0 role: ${roleName}`,
    } satisfies SyncProgress);

    const roleUsers = await listUsersByRole(roleId);

    for (const u of roleUsers) {
      const emailKey = u.email.toLowerCase();
      const existing = users.get(emailKey);
      if (existing) {
        if (!existing.roles.includes(roleId)) {
          existing.roles.push(roleId);
        }
      } else {
        users.set(emailKey, {
          auth0UserId: u.user_id,
          email: u.email,
          name: u.name || u.email,
          givenName: u.name?.split(' ')[0] || '',
          familyName: u.name?.split(' ').slice(1).join(' ') || '',
          roles: [roleId],
        });
      }
    }
  }

  return users;
}

// ── Current state (Atlassian SCIM) ─────────────────────────────────

interface CurrentState {
  users: Map<string, ScimUser>; // keyed by primary email
  groups: Map<string, ScimGroup>; // keyed by displayName
}

async function fetchCurrentState(emitter: EventEmitter): Promise<CurrentState> {
  emitter.emit('progress', {
    phase: 'fetch_atlassian_users',
    step: 1,
    totalSteps: 2,
    percentage: 45,
    description: 'Fetching Atlassian SCIM users...',
  } satisfies SyncProgress);

  const scimUsers = await scim.getUsers();
  const usersByEmail = new Map<string, ScimUser>();
  for (const u of scimUsers) {
    const email = u.emails?.find((e) => e.primary)?.value || u.userName;
    if (email) usersByEmail.set(email.toLowerCase(), u);
  }

  emitter.emit('progress', {
    phase: 'fetch_atlassian_groups',
    step: 2,
    totalSteps: 2,
    percentage: 60,
    description: 'Fetching Atlassian SCIM groups...',
  } satisfies SyncProgress);

  const scimGroups = await scim.getGroups();
  const groupsByName = new Map<string, ScimGroup>();
  for (const g of scimGroups) {
    groupsByName.set(g.displayName, g);
  }

  return { users: usersByEmail, groups: groupsByName };
}

// ── Compute diff ───────────────────────────────────────────────────

export function computeDiff(
  desired: Map<string, DesiredUser>,
  current: CurrentState,
  mappings: RoleGroupMapping[]
): SyncDiff {
  const diff: SyncDiff = {
    usersToCreate: [],
    usersToUpdate: [],
    usersToReactivate: [],
    usersToDeactivate: [],
    groupsToCreate: [],
    membershipChanges: [],
  };

  // Build role→groups lookup (one role can map to multiple groups)
  const roleToGroups = new Map<string, RoleGroupMapping[]>();
  for (const m of mappings) {
    const existing = roleToGroups.get(m.auth0RoleId) || [];
    existing.push(m);
    roleToGroups.set(m.auth0RoleId, existing);
  }

  // Groups to create: base on live SCIM snapshot, not stored atlassianGroupId.
  // If a mapping has a stale atlassianGroupId (group was deleted in Atlassian),
  // detect it and mark for re-creation. Deduplicate by group name.
  const seenGroupCreates = new Set<string>();
  const staleMappingIds: string[] = [];
  const missingGroupNames = new Set<string>(); // groups not in SCIM
  for (const m of mappings) {
    const existsInScim = current.groups.has(m.atlassianGroupName);
    if (!existsInScim) {
      missingGroupNames.add(m.atlassianGroupName);
      // Collect ALL stale mapping IDs, not just the first per group
      if (m.atlassianGroupId) {
        staleMappingIds.push(m.id);
      }
      if (!seenGroupCreates.has(m.atlassianGroupName)) {
        seenGroupCreates.add(m.atlassianGroupName);
        diff.groupsToCreate.push({
          name: m.atlassianGroupName,
          mappedFromRole: m.auth0RoleName,
        });
      }
    }
  }
  if (staleMappingIds.length > 0) {
    (diff as SyncDiff & { _staleMappingIds?: string[] })._staleMappingIds = staleMappingIds;
  }

  // Users: create, update, membership changes
  for (const [email, desiredUser] of desired) {
    const emailLower = email.toLowerCase();
    const existingUser = current.users.get(emailLower);

    if (!existingUser) {
      // New user — needs creation
      diff.usersToCreate.push({
        email: desiredUser.email,
        name: desiredUser.name,
        givenName: desiredUser.givenName,
        familyName: desiredUser.familyName,
        auth0UserId: desiredUser.auth0UserId,
      });

      // Membership additions for new user (will be resolved after user creation)
      for (const roleId of desiredUser.roles) {
        const roleMappings = roleToGroups.get(roleId) || [];
        for (const mapping of roleMappings) {
          const group = current.groups.get(mapping.atlassianGroupName);
          diff.membershipChanges.push({
            action: 'add',
            userEmail: email,
            groupName: mapping.atlassianGroupName,
            groupId: group?.id || (missingGroupNames.has(mapping.atlassianGroupName) ? null : mapping.atlassianGroupId),
            userScimId: null, // will be set after creation
            reason: `User added to Auth0 role ${mapping.auth0RoleName}`,
          });
        }
      }
    } else {
      // Existing but inactive user — needs reactivation before updates/membership
      if (!existingUser.active) {
        diff.usersToReactivate.push({
          email: desiredUser.email,
          name: desiredUser.name || existingUser.displayName,
          atlassianId: existingUser.id,
        });
      }

      // Existing user — check for updates
      const changes: Record<string, { from: string; to: string }> = {};
      if (
        existingUser.name?.givenName !== desiredUser.givenName &&
        desiredUser.givenName
      ) {
        changes.givenName = {
          from: existingUser.name?.givenName || '',
          to: desiredUser.givenName,
        };
      }
      if (
        existingUser.name?.familyName !== desiredUser.familyName &&
        desiredUser.familyName
      ) {
        changes.familyName = {
          from: existingUser.name?.familyName || '',
          to: desiredUser.familyName,
        };
      }
      if (
        existingUser.displayName !== desiredUser.name &&
        desiredUser.name
      ) {
        changes.displayName = {
          from: existingUser.displayName || '',
          to: desiredUser.name,
        };
      }
      if (Object.keys(changes).length > 0) {
        diff.usersToUpdate.push({
          email,
          atlassianId: existingUser.id,
          changes,
        });
      }

      // Membership: check each mapped role
      for (const roleId of desiredUser.roles) {
        const roleMappings = roleToGroups.get(roleId) || [];
        for (const mapping of roleMappings) {
          const group = current.groups.get(mapping.atlassianGroupName);
          const isMember = group?.members?.some((m) => m.value === existingUser.id);
          if (!isMember) {
            diff.membershipChanges.push({
              action: 'add',
              userEmail: email,
              groupName: mapping.atlassianGroupName,
              groupId: group?.id || (missingGroupNames.has(mapping.atlassianGroupName) ? null : mapping.atlassianGroupId),
              userScimId: existingUser.id,
              reason: `User added to Auth0 role ${mapping.auth0RoleName}`,
            });
          }
        }
      }
    }
  }

  // Deduplicate membership changes by (action, email, groupName)
  const seenMembership = new Set<string>();
  diff.membershipChanges = diff.membershipChanges.filter((c) => {
    const key = `${c.action}:${c.userEmail.toLowerCase()}:${c.groupName}`;
    if (seenMembership.has(key)) return false;
    seenMembership.add(key);
    return true;
  });

  // Build lowercase desired email set for deactivation check
  const desiredEmails = new Set([...desired.keys()].map((e) => e.toLowerCase()));

  // Users to deactivate: in Atlassian SCIM but not in any desired state
  for (const [email, scimUser] of current.users) {
    if (!scimUser.active) continue; // already deactivated
    if (!desiredEmails.has(email.toLowerCase())) {
      diff.usersToDeactivate.push({
        email,
        name: scimUser.displayName,
        atlassianId: scimUser.id,
      });
    }
  }

  // Build group→roles lookup: all Auth0 roles that grant membership to each group
  const groupToRoleIds = new Map<string, Set<string>>();
  for (const m of mappings) {
    const roles = groupToRoleIds.get(m.atlassianGroupName) || new Set();
    roles.add(m.auth0RoleId);
    groupToRoleIds.set(m.atlassianGroupName, roles);
  }

  // Build a one-time ID→user lookup for O(1) member resolution
  const userById = new Map<string, ScimUser>();
  for (const u of current.users.values()) {
    userById.set(u.id, u);
  }

  // Membership removals: user is in a SCIM group but no longer in ANY mapped Auth0 role for that group
  const seenRemovalGroups = new Set<string>(); // avoid processing same group twice
  for (const m of mappings) {
    if (seenRemovalGroups.has(m.atlassianGroupName)) continue;
    seenRemovalGroups.add(m.atlassianGroupName);
    const group = current.groups.get(m.atlassianGroupName);
    if (!group) continue;
    const grantingRoles = groupToRoleIds.get(m.atlassianGroupName) || new Set();
    for (const member of group.members || []) {
      const memberUser = userById.get(member.value);
      if (!memberUser) continue;
      const memberEmail =
        memberUser.emails?.find((e) => e.primary)?.value || memberUser.userName;
      const desiredUser = desired.get(memberEmail?.toLowerCase());
      // Only remove if user has NONE of the roles that grant access to this group
      const hasAnyGrantingRole = desiredUser?.roles.some((r) => grantingRoles.has(r));
      if (!desiredUser || !hasAnyGrantingRole) {
        diff.membershipChanges.push({
          action: 'remove',
          userEmail: memberEmail,
          groupName: m.atlassianGroupName,
          groupId: group.id,
          userScimId: member.value,
          reason: `User no longer in any Auth0 role granting access to ${m.atlassianGroupName}`,
        });
      }
    }
  }

  return diff;
}

// ── Execute diff ───────────────────────────────────────────────────

async function executeDiff(
  diff: SyncDiff,
  mappings: RoleGroupMapping[],
  emitter: EventEmitter
): Promise<SyncOperation[]> {
  const operations: SyncOperation[] = [];
  let seq = 0;

  const totalOps =
    diff.groupsToCreate.length +
    diff.usersToReactivate.length +
    diff.usersToCreate.length +
    diff.usersToUpdate.length +
    diff.usersToDeactivate.length +
    diff.membershipChanges.length;

  // Track newly created user SCIM IDs for membership resolution
  const newUserScimIds = new Map<string, string>();

  // Clear stale atlassianGroupId entries detected during diff computation
  const staleMappingIds = (diff as SyncDiff & { _staleMappingIds?: string[] })._staleMappingIds;
  if (staleMappingIds?.length) {
    await prisma.roleGroupMapping.updateMany({
      where: { id: { in: staleMappingIds } },
      data: { atlassianGroupId: null },
    });
  }

  // 1. Create groups first (needed for membership ops)
  for (const group of diff.groupsToCreate) {
    seq++;
    emitter.emit('progress', {
      phase: 'execute',
      step: seq,
      totalSteps: totalOps,
      percentage: Math.round((seq / totalOps) * 100),
      description: `Creating group ${group.name}...`,
    } satisfies SyncProgress);

    try {
      const created = await scim.createGroup(group.name);
      operations.push({
        seq,
        type: 'group_create',
        target: group.name,
        status: 'success',
        atlassianId: created.id,
        description: `Created group ${group.name}`,
      });

      // Backfill the mapping with the new group ID
      await prisma.roleGroupMapping.updateMany({
        where: { atlassianGroupName: group.name, atlassianGroupId: null },
        data: { atlassianGroupId: created.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      operations.push({
        seq,
        type: 'group_create',
        target: group.name,
        status: 'error',
        error: message,
        description: `Failed to create group ${group.name}: ${message}`,
      });
    }
  }

  // 2. Reactivate inactive users (before membership changes can reference them)
  for (const user of diff.usersToReactivate) {
    seq++;
    emitter.emit('progress', {
      phase: 'execute',
      step: seq,
      totalSteps: totalOps,
      percentage: Math.round((seq / totalOps) * 100),
      description: `Reactivating user ${user.email}...`,
    } satisfies SyncProgress);

    try {
      await scim.reactivateUser(user.atlassianId);
      operations.push({
        seq,
        type: 'user_reactivate',
        target: user.email,
        status: 'success',
        description: `Reactivated user ${user.name} (${user.email})`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      operations.push({
        seq,
        type: 'user_reactivate',
        target: user.email,
        status: 'error',
        error: message,
        description: `Failed to reactivate user ${user.email}: ${message}`,
      });
    }
  }

  // 3. Create users
  for (const user of diff.usersToCreate) {
    seq++;
    emitter.emit('progress', {
      phase: 'execute',
      step: seq,
      totalSteps: totalOps,
      percentage: Math.round((seq / totalOps) * 100),
      description: `Creating user ${user.email}...`,
    } satisfies SyncProgress);

    try {
      const created = await scim.createUser({
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
        displayName: user.name,
      });
      newUserScimIds.set(user.email.toLowerCase(), created.id);
      operations.push({
        seq,
        type: 'user_create',
        target: user.email,
        status: 'success',
        atlassianId: created.id,
        description: `Created user ${user.name} (${user.email}) in Atlassian`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      operations.push({
        seq,
        type: 'user_create',
        target: user.email,
        status: 'error',
        error: message,
        description: `Failed to create user ${user.email}: ${message}`,
      });
    }
  }

  // 3. Update users
  for (const user of diff.usersToUpdate) {
    seq++;
    emitter.emit('progress', {
      phase: 'execute',
      step: seq,
      totalSteps: totalOps,
      percentage: Math.round((seq / totalOps) * 100),
      description: `Updating user ${user.email}...`,
    } satisfies SyncProgress);

    try {
      await scim.updateUser(user.atlassianId, {
        givenName: user.changes.givenName?.to,
        familyName: user.changes.familyName?.to,
        displayName: user.changes.displayName?.to,
      });
      operations.push({
        seq,
        type: 'user_update',
        target: user.email,
        status: 'success',
        description: `Updated user ${user.email}: ${Object.keys(user.changes).join(', ')}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      operations.push({
        seq,
        type: 'user_update',
        target: user.email,
        status: 'error',
        error: message,
        description: `Failed to update user ${user.email}: ${message}`,
      });
    }
  }

  // 4. Deactivate users
  for (const user of diff.usersToDeactivate) {
    seq++;
    emitter.emit('progress', {
      phase: 'execute',
      step: seq,
      totalSteps: totalOps,
      percentage: Math.round((seq / totalOps) * 100),
      description: `Deactivating user ${user.email}...`,
    } satisfies SyncProgress);

    try {
      await scim.deactivateUser(user.atlassianId);
      operations.push({
        seq,
        type: 'user_deactivate',
        target: user.email,
        status: 'success',
        description: `Deactivated user ${user.name} (${user.email})`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      operations.push({
        seq,
        type: 'user_deactivate',
        target: user.email,
        status: 'error',
        error: message,
        description: `Failed to deactivate user ${user.email}: ${message}`,
      });
    }
  }

  // 5. Membership changes
  // Refresh mappings to get backfilled group IDs
  const freshMappings = await prisma.roleGroupMapping.findMany();
  const groupIdByName = new Map<string, string>();
  for (const m of freshMappings) {
    if (m.atlassianGroupId) groupIdByName.set(m.atlassianGroupName, m.atlassianGroupId);
  }

  for (const change of diff.membershipChanges) {
    seq++;
    const groupId = change.groupId || groupIdByName.get(change.groupName);
    const userScimId = change.userScimId || newUserScimIds.get(change.userEmail.toLowerCase());

    emitter.emit('progress', {
      phase: 'execute',
      step: seq,
      totalSteps: totalOps,
      percentage: Math.round((seq / totalOps) * 100),
      description: `${change.action === 'add' ? 'Adding' : 'Removing'} ${change.userEmail} ${change.action === 'add' ? 'to' : 'from'} ${change.groupName}...`,
    } satisfies SyncProgress);

    if (!groupId || !userScimId) {
      operations.push({
        seq,
        type: `membership_${change.action}`,
        target: change.userEmail,
        group: change.groupName,
        status: 'skipped',
        description: `Skipped ${change.action} ${change.userEmail} ${change.action === 'add' ? 'to' : 'from'} ${change.groupName}: missing ${!groupId ? 'group ID' : 'user SCIM ID'}`,
      });
      continue;
    }

    try {
      if (change.action === 'add') {
        await scim.addGroupMember(groupId, userScimId);
      } else {
        await scim.removeGroupMember(groupId, userScimId);
      }
      operations.push({
        seq,
        type: `membership_${change.action}`,
        target: change.userEmail,
        group: change.groupName,
        status: 'success',
        description: `${change.action === 'add' ? 'Added' : 'Removed'} ${change.userEmail} ${change.action === 'add' ? 'to' : 'from'} ${change.groupName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      operations.push({
        seq,
        type: `membership_${change.action}`,
        target: change.userEmail,
        group: change.groupName,
        status: 'error',
        error: message,
        description: `Failed to ${change.action} ${change.userEmail} ${change.action === 'add' ? 'to' : 'from'} ${change.groupName}: ${message}`,
      });
    }
  }

  return operations;
}

// ── Public API ─────────────────────────────────────────────────────

// If a sync run has been in dry_run/executing for longer than this, treat it as crashed
const LEASE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function runDrySync(triggeredBy: string): Promise<{ runId: string; emitter: EventEmitter }> {
  // Atomic check-and-create inside a serializable transaction to prevent TOCTOU race
  const run = await prisma.$transaction(async (tx) => {
    const active = await tx.syncRun.findFirst({
      where: { status: { in: ['dry_run', 'executing'] } },
      select: { id: true, triggeredBy: true, startedAt: true },
      orderBy: { startedAt: 'desc' },
    });
    if (active) {
      const age = Date.now() - active.startedAt.getTime();
      if (age > LEASE_TTL_MS) {
        // Stale run from a crashed process — expire it
        await tx.syncRun.update({
          where: { id: active.id },
          data: { status: 'failed', completedAt: new Date() },
        });
      } else {
        throw Object.assign(new Error(`Sync already running by ${active.triggeredBy}`), {
          status: 409,
          activeRun: active,
        });
      }
    }
    return tx.syncRun.create({
      data: { status: 'dry_run', triggeredBy, diff: {} },
    });
  }, { isolationLevel: 'Serializable' });

  const emitter = new EventEmitter();

  // Run async (don't await — caller consumes progress via SSE)
  (async () => {
    try {
      const mappings = await prisma.roleGroupMapping.findMany();
      if (mappings.length === 0) {
        await prisma.syncRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            diff: { usersToCreate: [], usersToUpdate: [], usersToReactivate: [], usersToDeactivate: [], groupsToCreate: [], membershipChanges: [] },
            stats: { created: 0, updated: 0, reactivated: 0, deactivated: 0, groupsAdded: 0, groupsRemoved: 0, groupsCreated: 0, errors: 0, duration_ms: 0 },
          },
        });
        emitter.emit('progress', { phase: 'done', step: 0, totalSteps: 0, percentage: 100, description: 'No mappings configured' });
        return;
      }

      const startTime = Date.now();
      const desired = await fetchDesiredState(mappings, emitter);
      const current = await fetchCurrentState(emitter);

      emitter.emit('progress', { phase: 'computing_diff', step: 1, totalSteps: 1, percentage: 80, description: 'Computing diff...' } satisfies SyncProgress);

      const diff = computeDiff(desired, current, mappings);

      const stats = {
        created: diff.usersToCreate.length,
        updated: diff.usersToUpdate.length,
        reactivated: diff.usersToReactivate.length,
        deactivated: diff.usersToDeactivate.length,
        groupsCreated: diff.groupsToCreate.length,
        groupsAdded: diff.membershipChanges.filter((c) => c.action === 'add').length,
        groupsRemoved: diff.membershipChanges.filter((c) => c.action === 'remove').length,
        errors: 0,
        duration_ms: Date.now() - startTime,
      };

      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'completed', completedAt: new Date(), diff: diff as object, stats },
      });

      emitter.emit('progress', { phase: 'done', step: 1, totalSteps: 1, percentage: 100, description: 'Dry run complete' } satisfies SyncProgress);
    } catch (err) {
      logger.error({ err, runId: run.id }, 'Dry sync failed');
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      emitter.emit('progress', {
        phase: 'error',
        step: 0,
        totalSteps: 0,
        percentage: 0,
        description: err instanceof Error ? err.message : 'Unknown error',
      } satisfies SyncProgress);
    }
  })();

  return { runId: run.id, emitter };
}

const DRY_RUN_TTL_MS = 60 * 60 * 1000; // 60 minutes

export async function executeSync(
  dryRunId: string,
  triggeredBy: string
): Promise<{ runId: string; emitter: EventEmitter }> {
  // Atomic check-validate-create inside a serializable transaction
  const { run, dryRun } = await prisma.$transaction(async (tx) => {
    const active = await tx.syncRun.findFirst({
      where: { status: { in: ['dry_run', 'executing'] } },
      select: { id: true, triggeredBy: true, startedAt: true },
      orderBy: { startedAt: 'desc' },
    });
    if (active) {
      const activeAge = Date.now() - active.startedAt.getTime();
      if (activeAge > LEASE_TTL_MS) {
        await tx.syncRun.update({
          where: { id: active.id },
          data: { status: 'failed', completedAt: new Date() },
        });
      } else {
        throw Object.assign(new Error(`Sync already running by ${active.triggeredBy}`), {
          status: 409,
          activeRun: active,
        });
      }
    }

    const dr = await tx.syncRun.findUnique({ where: { id: dryRunId } });
    if (!dr) throw Object.assign(new Error('Dry run not found'), { status: 404 });
    if (dr.status !== 'completed') throw Object.assign(new Error('Can only execute a completed dry run'), { status: 400 });
    if (!dr.completedAt) throw Object.assign(new Error('Dry run has no completion timestamp'), { status: 400 });

    // Prevent replay: check if this dry run was already executed
    const priorExecution = await tx.syncRun.findFirst({
      where: { dryRunId, status: { not: 'failed' } },
    });
    if (priorExecution) {
      throw Object.assign(new Error('This dry run has already been executed'), { status: 409 });
    }

    const age = Date.now() - dr.completedAt.getTime();
    if (age > DRY_RUN_TTL_MS) {
      throw Object.assign(new Error(`Dry run expired (${Math.round(age / 60_000)} minutes old, max 60)`), { status: 400 });
    }

    const created = await tx.syncRun.create({
      data: { status: 'executing', triggeredBy, dryRunId, diff: dr.diff as object },
    });

    return { run: created, dryRun: dr };
  }, { isolationLevel: 'Serializable' });

  const emitter = new EventEmitter();

  (async () => {
    try {
      const startTime = Date.now();
      const diff = dryRun.diff as unknown as SyncDiff;
      const mappings = await prisma.roleGroupMapping.findMany();
      const operations = await executeDiff(diff, mappings, emitter);

      const errors = operations.filter((o) => o.status === 'error').length;
      const status = operations.length === 0 ? 'completed' : errors === operations.length ? 'failed' : errors > 0 ? 'partial' : 'completed';

      const stats = {
        created: operations.filter((o) => o.type === 'user_create' && o.status === 'success').length,
        updated: operations.filter((o) => o.type === 'user_update' && o.status === 'success').length,
        reactivated: operations.filter((o) => o.type === 'user_reactivate' && o.status === 'success').length,
        deactivated: operations.filter((o) => o.type === 'user_deactivate' && o.status === 'success').length,
        groupsCreated: operations.filter((o) => o.type === 'group_create' && o.status === 'success').length,
        groupsAdded: operations.filter((o) => o.type === 'membership_add' && o.status === 'success').length,
        groupsRemoved: operations.filter((o) => o.type === 'membership_remove' && o.status === 'success').length,
        errors,
        duration_ms: Date.now() - startTime,
      };

      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt: new Date(),
          result: { operations } as object,
          stats,
        },
      });

      emitter.emit('progress', { phase: 'done', step: 1, totalSteps: 1, percentage: 100, description: `Execution ${status}` } satisfies SyncProgress);
    } catch (err) {
      logger.error({ err, runId: run.id }, 'Sync execution failed');
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      emitter.emit('progress', {
        phase: 'error',
        step: 0,
        totalSteps: 0,
        percentage: 0,
        description: err instanceof Error ? err.message : 'Unknown error',
      } satisfies SyncProgress);
    }
  })();

  return { runId: run.id, emitter };
}

// Store active emitters for SSE streaming
const activeEmitters = new Map<string, EventEmitter>();

export function storeEmitter(runId: string, emitter: EventEmitter): void {
  activeEmitters.set(runId, emitter);
  const cleanup = (p: SyncProgress) => {
    if (p.phase === 'done' || p.phase === 'error') {
      setTimeout(() => activeEmitters.delete(runId), 5000);
      emitter.removeListener('progress', cleanup);
    }
  };
  emitter.on('progress', cleanup);
}

export function getEmitter(runId: string): EventEmitter | undefined {
  return activeEmitters.get(runId);
}
