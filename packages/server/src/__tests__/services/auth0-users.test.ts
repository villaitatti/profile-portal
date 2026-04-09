import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetAll } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
}));

// Mock env before importing anything
vi.mock('../../env.js', () => ({
  env: {
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_AUDIENCE: 'test',
    AUTH0_M2M_CLIENT_ID: 'test',
    AUTH0_M2M_CLIENT_SECRET: 'test',
    AUTH0_FELLOWS_ROLE_ID: 'test',
    AUTH0_CONNECTION: 'Username-Password-Authentication',
  },
  isDevMode: false,
}));

// Mock auth0 SDK — must return constructors
vi.mock('auth0', () => ({
  ManagementClient: class {
    users = { getAll: mockGetAll };
    usersByEmail = { getByEmail: vi.fn() };
    roles = { getAll: vi.fn(), getUsers: vi.fn() };
  },
  AuthenticationClient: class {
    database = { changePassword: vi.fn() };
  },
}));

import { listAllUsers } from '../../services/auth0.service.js';

describe('listAllUsers', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
  });

  it('returns users from a single page', async () => {
    const mockUsers = [
      { user_id: 'u1', email: 'a@test.com', name: 'Alice', email_verified: true, last_login: '2026-04-01', created_at: '2025-01-01' },
      { user_id: 'u2', email: 'b@test.com', name: 'Bob', email_verified: false, last_login: null, created_at: '2025-02-01' },
    ];
    mockGetAll.mockResolvedValueOnce({ data: mockUsers });

    const result = await listAllUsers();

    expect(result).toHaveLength(2);
    expect(result[0].email).toBe('a@test.com');
    expect(result[0].email_verified).toBe(true);
    expect(result[1].email_verified).toBe(false);
    expect(mockGetAll).toHaveBeenCalledWith(
      expect.objectContaining({
        per_page: 100,
        page: 0,
        include_fields: true,
      })
    );
  });

  it('paginates when more than 100 users exist', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      user_id: `u${i}`,
      email: `user${i}@test.com`,
      name: `User ${i}`,
      email_verified: true,
      last_login: '2026-04-01',
      created_at: '2025-01-01',
    }));
    const page2 = [
      { user_id: 'u100', email: 'user100@test.com', name: 'User 100', email_verified: true, last_login: '2026-04-01', created_at: '2025-01-01' },
    ];

    mockGetAll
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 });

    const result = await listAllUsers();

    expect(result).toHaveLength(101);
    expect(mockGetAll).toHaveBeenCalledTimes(2);
    expect(mockGetAll).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 0 }));
    expect(mockGetAll).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 1 }));
  });

  it('returns correct fields', async () => {
    mockGetAll.mockResolvedValueOnce({
      data: [{
        user_id: 'u1',
        email: 'test@example.com',
        name: 'Test User',
        email_verified: true,
        last_login: '2026-04-01T10:00:00.000Z',
        created_at: '2025-01-15T08:00:00.000Z',
      }],
    });

    const [user] = await listAllUsers();

    expect(user).toEqual({
      user_id: 'u1',
      email: 'test@example.com',
      name: 'Test User',
      email_verified: true,
      last_login: '2026-04-01T10:00:00.000Z',
      created_at: '2025-01-15T08:00:00.000Z',
    });
  });
});
