import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../env.js', () => ({
  env: {
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_AUDIENCE: 'test',
    AUTH0_M2M_CLIENT_ID: 'test',
    AUTH0_M2M_CLIENT_SECRET: 'test',
    AUTH0_FELLOWS_ROLE_ID: 'test',
    AUTH0_CONNECTION: 'Username-Password-Authentication',
    ATLASSIAN_SCIM_BASE_URL: 'https://test.atlassian.net',
    ATLASSIAN_SCIM_DIRECTORY_ID: 'test-dir',
    ATLASSIAN_SCIM_BEARER_TOKEN: 'test-token',
  },
  isDevMode: true,
}));

vi.mock('../../services/atlassian-scim.service.js', () => ({
  isScimConfigured: vi.fn().mockReturnValue(true),
  getGroups: vi.fn().mockResolvedValue([
    { id: 'group-1', displayName: 'staff-it', members: [] },
    { id: 'group-2', displayName: 'fellows', members: [] },
  ]),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    roleGroupMapping: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-mapping', ...args.data, createdAt: new Date(), updatedAt: new Date() })
      ),
      delete: vi.fn(),
    },
    syncRun: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../services/atlassian-sync.service.js', () => ({
  runDrySync: vi.fn(),
  executeSync: vi.fn(),
  storeEmitter: vi.fn(),
  getEmitter: vi.fn(),
}));

vi.mock('../../lib/sse-token.js', () => ({
  createSseToken: vi.fn(),
  verifySseToken: vi.fn(),
}));

vi.mock('auth0', () => ({
  ManagementClient: class { users = { getAll: vi.fn() }; usersByEmail = { getByEmail: vi.fn() }; roles = { getAll: vi.fn(), getUsers: vi.fn() }; },
  AuthenticationClient: class { database = { changePassword: vi.fn() }; },
}));

import express from 'express';
import request from 'supertest';
import { getGroups } from '../../services/atlassian-scim.service.js';
import { prisma } from '../../lib/prisma.js';

// Dynamic import to ensure mocks are in place
const { syncAdminRoutes } = await import('../../routes/sync-admin.routes.js');

const app = express();
app.use(express.json());
// Mock auth middleware
app.use((req, _res, next) => {
  (req as unknown as Record<string, unknown>).auth = { email: 'test@example.com', sub: 'auth0|test' };
  next();
});
app.use('/api/admin/sync', syncAdminRoutes);

describe('GET /api/admin/sync/groups', () => {
  it('returns Atlassian SCIM groups with id and displayName', async () => {
    const res = await request(app).get('/api/admin/sync/groups');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'group-1', displayName: 'staff-it' },
      { id: 'group-2', displayName: 'fellows' },
    ]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 500 when getGroups throws', async () => {
    vi.mocked(getGroups).mockRejectedValueOnce(new Error('SCIM unavailable'));
    const res = await request(app).get('/api/admin/sync/groups');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/sync/mappings', () => {
  beforeEach(() => {
    vi.mocked(prisma.roleGroupMapping.create).mockClear();
  });

  it('stores createdBy from auth email', async () => {
    const res = await request(app)
      .post('/api/admin/sync/mappings')
      .send({
        auth0RoleId: 'role-1',
        auth0RoleName: 'staff-IT',
        atlassianGroupName: 'staff-it',
        atlassianGroupId: 'group-1',
      });

    expect(res.status).toBe(201);
    expect(prisma.roleGroupMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdBy: 'test@example.com',
        atlassianGroupId: 'group-1',
      }),
    });
  });

  it('stores atlassianGroupId when provided', async () => {
    await request(app)
      .post('/api/admin/sync/mappings')
      .send({
        auth0RoleId: 'role-1',
        auth0RoleName: 'staff-IT',
        atlassianGroupName: 'staff-it',
        atlassianGroupId: 'group-abc',
      });

    expect(prisma.roleGroupMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        atlassianGroupId: 'group-abc',
      }),
    });
  });

  it('stores null atlassianGroupId for new groups', async () => {
    await request(app)
      .post('/api/admin/sync/mappings')
      .send({
        auth0RoleId: 'role-1',
        auth0RoleName: 'staff-IT',
        atlassianGroupName: 'new-group',
      });

    expect(prisma.roleGroupMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        atlassianGroupId: null,
      }),
    });
  });

  // Regression: the handler used schema.parse inside try→next(err); ZodError
  // carries no .status, so malformed input surfaced as a 500 "Internal Server
  // Error" and was logged as an unhandled server error.
  it('rejects malformed input with 400 VALIDATION_ERROR, not 500', async () => {
    const res = await request(app)
      .post('/api/admin/sync/mappings')
      .send({ auth0RoleId: '' }); // missing required fields

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.roleGroupMapping.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/sync/mappings/:id', () => {
  beforeEach(() => {
    vi.mocked(prisma.roleGroupMapping.delete).mockReset();
  });

  it('returns 204 on successful delete', async () => {
    vi.mocked(prisma.roleGroupMapping.delete).mockResolvedValue(
      {} as Awaited<ReturnType<typeof prisma.roleGroupMapping.delete>>
    );

    const res = await request(app).delete('/api/admin/sync/mappings/mapping-1');

    expect(res.status).toBe(204);
  });

  // Regression: Prisma P2025 (delete target missing) previously fell through
  // to the error middleware as a 500.
  it('returns 404 when the mapping does not exist', async () => {
    vi.mocked(prisma.roleGroupMapping.delete).mockRejectedValue(
      Object.assign(new Error('Record not found'), { code: 'P2025' })
    );

    const res = await request(app).delete('/api/admin/sync/mappings/gone');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
