import { describe, it, expect, vi } from 'vitest';

// Mock env before importing anything that uses it
vi.mock('../../env.js', () => ({
  env: {
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_AUDIENCE: 'test',
    AUTH0_M2M_CLIENT_ID: 'test',
    AUTH0_M2M_CLIENT_SECRET: 'test',
    AUTH0_FELLOWS_ROLE_ID: 'test',
    AUTH0_CONNECTION: 'Username-Password-Authentication',
    CIVICRM_BASE_URL: 'http://localhost',
    CIVICRM_API_KEY: 'test',
    DATABASE_URL: 'postgresql://localhost/test',
  },
  isDevMode: true,
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    syncRun: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    roleGroupMapping: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../services/auth0.service.js', () => ({
  listUsersByRole: vi.fn().mockResolvedValue([]),
  listRoles: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/atlassian-scim.service.js', () => ({
  getUsers: vi.fn().mockResolvedValue([]),
  getGroups: vi.fn().mockResolvedValue([]),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  createGroup: vi.fn(),
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
  isScimConfigured: vi.fn().mockReturnValue(true),
}));

import { computeDiff } from '../../services/atlassian-sync.service.js';
import type { ScimUser, ScimGroup } from '../../services/atlassian-scim.service.js';
import type { RoleGroupMapping } from '@prisma/client';

// ── Helpers ────────────────────────────────────────────────────────

function makeDesiredUser(overrides: Partial<{ auth0UserId: string; email: string; name: string; givenName: string; familyName: string; roles: string[] }> = {}) {
  return {
    auth0UserId: overrides.auth0UserId || 'auth0|1',
    email: overrides.email || 'user@itatti.harvard.edu',
    name: overrides.name || 'Test User',
    givenName: overrides.givenName || 'Test',
    familyName: overrides.familyName || 'User',
    roles: overrides.roles || ['role-1'],
  };
}

function makeScimUser(overrides: Partial<ScimUser> = {}): ScimUser {
  return {
    id: overrides.id || 'scim-1',
    userName: overrides.userName || 'user@itatti.harvard.edu',
    displayName: overrides.displayName || 'Test User',
    name: overrides.name || { givenName: 'Test', familyName: 'User' },
    emails: overrides.emails || [{ value: 'user@itatti.harvard.edu', primary: true }],
    active: overrides.active ?? true,
  };
}

function makeScimGroup(overrides: Partial<ScimGroup> = {}): ScimGroup {
  return {
    id: overrides.id || 'group-1',
    displayName: overrides.displayName || 'itatti-all',
    members: overrides.members || [],
  };
}

function makeMapping(overrides: Partial<RoleGroupMapping> = {}): RoleGroupMapping {
  return {
    id: overrides.id || 'mapping-1',
    auth0RoleId: overrides.auth0RoleId || 'role-1',
    auth0RoleName: overrides.auth0RoleName || 'staff-IT',
    atlassianGroupId: 'atlassianGroupId' in overrides ? (overrides.atlassianGroupId as string | null) : 'group-1',
    atlassianGroupName: overrides.atlassianGroupName || 'itatti-all',
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}

function makeCurrentState(users: ScimUser[] = [], groups: ScimGroup[] = []) {
  const userMap = new Map<string, ScimUser>();
  for (const u of users) {
    const email = u.emails?.find((e) => e.primary)?.value || u.userName;
    userMap.set(email.toLowerCase(), u);
  }
  const groupMap = new Map<string, ScimGroup>();
  for (const g of groups) {
    groupMap.set(g.displayName, g);
  }
  return { users: userMap, groups: groupMap };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('computeDiff', () => {
  it('returns empty diff when both sides are empty', () => {
    const desired = new Map();
    const current = makeCurrentState();
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToCreate).toHaveLength(0);
    expect(diff.usersToUpdate).toHaveLength(0);
    expect(diff.usersToDeactivate).toHaveLength(0);
    expect(diff.groupsToCreate).toHaveLength(0);
    expect(diff.membershipChanges).toHaveLength(0);
  });

  it('detects new user to create', () => {
    const desired = new Map([['user@itatti.harvard.edu', makeDesiredUser()]]);
    const current = makeCurrentState([], [makeScimGroup()]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToCreate).toHaveLength(1);
    expect(diff.usersToCreate[0].email).toBe('user@itatti.harvard.edu');
  });

  it('detects user to deactivate (in Atlassian, not in Auth0)', () => {
    const desired = new Map();
    const scimUser = makeScimUser();
    const current = makeCurrentState([scimUser]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToDeactivate).toHaveLength(1);
    expect(diff.usersToDeactivate[0].email).toBe('user@itatti.harvard.edu');
  });

  it('skips already-deactivated users', () => {
    const desired = new Map();
    const scimUser = makeScimUser({ active: false });
    const current = makeCurrentState([scimUser]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToDeactivate).toHaveLength(0);
  });

  it('detects user name update', () => {
    const desired = new Map([
      ['user@itatti.harvard.edu', makeDesiredUser({ givenName: 'Updated', familyName: 'Name' })],
    ]);
    const scimUser = makeScimUser({ name: { givenName: 'Old', familyName: 'Name' } });
    const current = makeCurrentState([scimUser], [makeScimGroup()]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToUpdate).toHaveLength(1);
    expect(diff.usersToUpdate[0].changes.givenName).toEqual({ from: 'Old', to: 'Updated' });
  });

  it('returns no update when names match', () => {
    const desired = new Map([['user@itatti.harvard.edu', makeDesiredUser()]]);
    const scimUser = makeScimUser();
    const current = makeCurrentState([scimUser], [makeScimGroup()]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToUpdate).toHaveLength(0);
  });

  it('detects group to create when mapping has no atlassianGroupId', () => {
    const mapping = makeMapping({ atlassianGroupId: null, atlassianGroupName: 'new-group' });
    const desired = new Map();
    const current = makeCurrentState();
    const diff = computeDiff(desired, current, [mapping]);

    expect(diff.groupsToCreate).toHaveLength(1);
    expect(diff.groupsToCreate[0].name).toBe('new-group');
  });

  it('does not create group when it already exists in SCIM', () => {
    const mapping = makeMapping({ atlassianGroupId: null, atlassianGroupName: 'existing-group' });
    const group = makeScimGroup({ displayName: 'existing-group' });
    const desired = new Map();
    const current = makeCurrentState([], [group]);
    const diff = computeDiff(desired, current, [mapping]);

    expect(diff.groupsToCreate).toHaveLength(0);
  });

  it('detects membership addition for existing user', () => {
    const desired = new Map([['user@itatti.harvard.edu', makeDesiredUser()]]);
    const scimUser = makeScimUser();
    const group = makeScimGroup({ members: [] }); // user not in group
    const current = makeCurrentState([scimUser], [group]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    const adds = diff.membershipChanges.filter((c) => c.action === 'add');
    expect(adds).toHaveLength(1);
    expect(adds[0].userEmail).toBe('user@itatti.harvard.edu');
    expect(adds[0].groupName).toBe('itatti-all');
  });

  it('skips membership addition when user already in group', () => {
    const desired = new Map([['user@itatti.harvard.edu', makeDesiredUser()]]);
    const scimUser = makeScimUser();
    const group = makeScimGroup({ members: [{ value: 'scim-1' }] }); // user already in group
    const current = makeCurrentState([scimUser], [group]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    const adds = diff.membershipChanges.filter((c) => c.action === 'add');
    expect(adds).toHaveLength(0);
  });

  it('detects membership removal when user no longer in Auth0 role', () => {
    const desired = new Map(); // no desired users
    const scimUser = makeScimUser();
    const group = makeScimGroup({ members: [{ value: 'scim-1' }] });
    const current = makeCurrentState([scimUser], [group]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    const removes = diff.membershipChanges.filter((c) => c.action === 'remove');
    expect(removes).toHaveLength(1);
    expect(removes[0].userEmail).toBe('user@itatti.harvard.edu');
  });

  it('deduplicates user across multiple mapped roles', () => {
    const mapping1 = makeMapping({ id: 'm1', auth0RoleId: 'role-1', auth0RoleName: 'staff-IT', atlassianGroupName: 'group-a', atlassianGroupId: 'ga' });
    const mapping2 = makeMapping({ id: 'm2', auth0RoleId: 'role-2', auth0RoleName: 'staff-all', atlassianGroupName: 'group-b', atlassianGroupId: 'gb' });
    const desired = new Map([
      ['user@itatti.harvard.edu', makeDesiredUser({ roles: ['role-1', 'role-2'] })],
    ]);
    const groupA = makeScimGroup({ id: 'ga', displayName: 'group-a' });
    const groupB = makeScimGroup({ id: 'gb', displayName: 'group-b' });
    const current = makeCurrentState([], [groupA, groupB]);
    const diff = computeDiff(desired, current, [mapping1, mapping2]);

    // Only one user create, even though user is in two roles
    expect(diff.usersToCreate).toHaveLength(1);
    // But two membership additions (one per group)
    const adds = diff.membershipChanges.filter((c) => c.action === 'add');
    expect(adds).toHaveLength(2);
  });

  it('handles pre-existing user adoption (match by email)', () => {
    const desired = new Map([
      ['user@itatti.harvard.edu', makeDesiredUser({ givenName: 'New', familyName: 'Name' })],
    ]);
    // User already exists in Atlassian with different name
    const scimUser = makeScimUser({ name: { givenName: 'Old', familyName: 'Name' } });
    const group = makeScimGroup();
    const current = makeCurrentState([scimUser], [group]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    // Should be an update, not a create
    expect(diff.usersToCreate).toHaveLength(0);
    expect(diff.usersToUpdate).toHaveLength(1);
  });

  it('handles no changes (identical state)', () => {
    const desired = new Map([['user@itatti.harvard.edu', makeDesiredUser()]]);
    const scimUser = makeScimUser();
    const group = makeScimGroup({ members: [{ value: 'scim-1' }] });
    const current = makeCurrentState([scimUser], [group]);
    const mapping = makeMapping();
    const diff = computeDiff(desired, current, [mapping]);

    expect(diff.usersToCreate).toHaveLength(0);
    expect(diff.usersToUpdate).toHaveLength(0);
    expect(diff.usersToDeactivate).toHaveLength(0);
    expect(diff.groupsToCreate).toHaveLength(0);
    expect(diff.membershipChanges).toHaveLength(0);
  });

  it('creates membership additions for new users (with null userScimId)', () => {
    const desired = new Map([['new@itatti.harvard.edu', makeDesiredUser({ email: 'new@itatti.harvard.edu' })]]);
    const group = makeScimGroup();
    const current = makeCurrentState([], [group]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    expect(diff.usersToCreate).toHaveLength(1);
    const adds = diff.membershipChanges.filter((c) => c.action === 'add');
    expect(adds).toHaveLength(1);
    expect(adds[0].userScimId).toBeNull(); // resolved during execution
  });

  it('handles email case insensitivity', () => {
    const desired = new Map([['User@ITATTI.harvard.edu', makeDesiredUser({ email: 'User@ITATTI.harvard.edu' })]]);
    const scimUser = makeScimUser({
      emails: [{ value: 'user@itatti.harvard.edu', primary: true }],
    });
    const group = makeScimGroup({ members: [{ value: 'scim-1' }] });
    const current = makeCurrentState([scimUser], [group]);
    const diff = computeDiff(desired, current, [makeMapping()]);

    // Should match despite case difference — no create, no deactivate
    expect(diff.usersToCreate).toHaveLength(0);
    expect(diff.usersToDeactivate).toHaveLength(0);
  });
});
