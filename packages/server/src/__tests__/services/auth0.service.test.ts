import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above module-level consts, so the spies have to
// be created inside vi.hoisted or they're still in TDZ when the mocked
// ManagementClient is constructed at import time.
const { getUsers, getAll, getRoles, assignRoles } = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getAll: vi.fn(),
  getRoles: vi.fn(),
  assignRoles: vi.fn(),
}));

vi.mock('auth0', () => ({
  ManagementClient: class {
    roles = { getUsers, getAll: vi.fn() };
    users = { getAll, getRoles, assignRoles };
    usersByEmail = { getByEmail: vi.fn() };
  },
  AuthenticationClient: class {
    database = { changePassword: vi.fn() };
  },
}));

vi.mock('../../env.js', () => ({
  env: {
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_M2M_CLIENT_ID: 'cid',
    AUTH0_M2M_CLIENT_SECRET: 'secret',
    AUTH0_CONNECTION: 'Username-Password-Authentication',
    AUTH0_FELLOWS_ROLE_ID: 'rol_fellows',
  },
  isDevMode: false,
}));

import { listUsersByRole, ensureFellowsRole } from '../../services/auth0.service.js';

function roleUser(n: number) {
  return { user_id: `auth0|${n}`, email: `fellow${n}@example.org`, name: `Fellow ${n}` };
}

describe('listUsersByRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockResolvedValue({ data: [] });
  });

  it('follows checkpoint pagination past the 1000-record offset ceiling', async () => {
    // 12 pages of 100 = 1200 users. Offset pagination (page/per_page) would have
    // been rejected by Auth0 at the 1000-record mark; checkpoint pagination has
    // no such cap. This is the regression guard for the fellows role, which
    // accumulates members across cohorts and never shrinks.
    const pages = Array.from({ length: 12 }, (_, p) => ({
      users: Array.from({ length: 100 }, (_, i) => roleUser(p * 100 + i)),
      next: p < 11 ? `cursor-${p + 1}` : undefined,
    }));

    let call = 0;
    getUsers.mockImplementation(() => Promise.resolve({ data: pages[call++] }));

    const users = await listUsersByRole('rol_fellows');

    expect(users).toHaveLength(1200);
    expect(getUsers).toHaveBeenCalledTimes(12);

    // First call must not carry a cursor; subsequent calls must carry the
    // previous response's `next`, never a page index.
    expect(getUsers.mock.calls[0][0]).toEqual({ id: 'rol_fellows', take: 100 });
    expect(getUsers.mock.calls[1][0]).toEqual({
      id: 'rol_fellows',
      take: 100,
      from: 'cursor-1',
    });
    for (const [args] of getUsers.mock.calls) {
      expect(args).not.toHaveProperty('page');
      expect(args).not.toHaveProperty('per_page');
    }
  });

  it('stops when the response carries no continuation token', async () => {
    getUsers.mockResolvedValue({ data: { users: [roleUser(1)], next: undefined } });

    const users = await listUsersByRole('rol_fellows');

    expect(users).toHaveLength(1);
    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  it('tolerates a bare-array response shape', async () => {
    getUsers.mockResolvedValue({ data: [roleUser(1), roleUser(2)] });

    const users = await listUsersByRole('rol_fellows');

    expect(users).toHaveLength(2);
    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  it('attaches civicrm_id from app_metadata', async () => {
    getUsers.mockResolvedValue({ data: { users: [roleUser(1)], next: undefined } });
    getAll.mockResolvedValue({
      data: [{ user_id: 'auth0|1', app_metadata: { civicrm_id: 42 } }],
    });

    const users = await listUsersByRole('rol_fellows');

    expect(users[0].civicrmId).toBe('42');
  });
});

describe('ensureFellowsRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assigns the role when it is missing', async () => {
    getRoles.mockResolvedValue({ data: [{ id: 'rol_other' }] });

    const repaired = await ensureFellowsRole('auth0|1');

    expect(repaired).toBe(true);
    expect(assignRoles).toHaveBeenCalledWith(
      { id: 'auth0|1' },
      { roles: ['rol_fellows'] }
    );
  });

  it('is a no-op when the role is already present', async () => {
    getRoles.mockResolvedValue({ data: [{ id: 'rol_fellows' }] });

    const repaired = await ensureFellowsRole('auth0|1');

    expect(repaired).toBe(false);
    expect(assignRoles).not.toHaveBeenCalled();
  });
});
