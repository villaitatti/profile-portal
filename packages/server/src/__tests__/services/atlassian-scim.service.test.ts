import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock env before importing the service
vi.mock('../../env.js', () => ({
  env: {
    ATLASSIAN_SCIM_BASE_URL: 'https://api.atlassian.com/scim/directory',
    ATLASSIAN_SCIM_DIRECTORY_ID: 'test-dir-id',
    ATLASSIAN_SCIM_BEARER_TOKEN: 'test-token',
  },
  isDevMode: false,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  isScimConfigured,
  getUsers,
  getGroups,
  createUser,
  updateUser,
  deactivateUser,
  createGroup,
  addGroupMember,
  removeGroupMember,
} from '../../services/atlassian-scim.service.js';

// ── Fetch mock ─────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('isScimConfigured', () => {
  it('returns true when all env vars are set', () => {
    expect(isScimConfigured()).toBe(true);
  });
});

describe('getUsers', () => {
  it('fetches a single page of users', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        totalResults: 2,
        startIndex: 1,
        itemsPerPage: 100,
        Resources: [
          { id: '1', userName: 'a@test.com', displayName: 'A', name: { givenName: 'A', familyName: 'B' }, emails: [{ value: 'a@test.com', primary: true }], active: true },
          { id: '2', userName: 'b@test.com', displayName: 'B', name: { givenName: 'B', familyName: 'C' }, emails: [{ value: 'b@test.com', primary: true }], active: true },
        ],
      })
    );

    const users = await getUsers();
    expect(users).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/scim/v2/Users?startIndex=1&count=100');
  });

  it('paginates through multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          totalResults: 150,
          startIndex: 1,
          itemsPerPage: 100,
          Resources: Array.from({ length: 100 }, (_, i) => ({
            id: `${i}`, userName: `u${i}@test.com`, displayName: `U${i}`, name: { givenName: 'U', familyName: `${i}` }, emails: [{ value: `u${i}@test.com`, primary: true }], active: true,
          })),
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          totalResults: 150,
          startIndex: 101,
          itemsPerPage: 100,
          Resources: Array.from({ length: 50 }, (_, i) => ({
            id: `${100 + i}`, userName: `u${100 + i}@test.com`, displayName: `U${100 + i}`, name: { givenName: 'U', familyName: `${100 + i}` }, emails: [{ value: `u${100 + i}@test.com`, primary: true }], active: true,
          })),
        })
      );

    const users = await getUsers();
    expect(users).toHaveLength(150);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when no users exist', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ totalResults: 0, startIndex: 1, itemsPerPage: 100, Resources: [] })
    );

    const users = await getUsers();
    expect(users).toHaveLength(0);
  });
});

describe('createUser', () => {
  it('sends correct SCIM payload and returns created user', async () => {
    const createdUser = {
      id: 'new-1',
      userName: 'new@test.com',
      displayName: 'New User',
      name: { givenName: 'New', familyName: 'User' },
      emails: [{ value: 'new@test.com', primary: true }],
      active: true,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(createdUser, 201));

    const result = await createUser({
      email: 'new@test.com',
      givenName: 'New',
      familyName: 'User',
      displayName: 'New User',
    });

    expect(result.id).toBe('new-1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.userName).toBe('new@test.com');
    expect(body.name.givenName).toBe('New');
  });
});

describe('updateUser', () => {
  it('sends PATCH with correct operations', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', userName: 'a@test.com', displayName: 'Updated', name: { givenName: 'Updated', familyName: 'User' }, emails: [], active: true })
    );

    await updateUser('1', { givenName: 'Updated', displayName: 'Updated User' });

    expect(mockFetch.mock.calls[0][0]).toContain('/Users/1');
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.Operations).toHaveLength(2);
  });
});

describe('deactivateUser', () => {
  it('sends PATCH to set active: false', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: '1', userName: 'a@test.com', displayName: 'A', name: { givenName: 'A', familyName: 'B' }, emails: [], active: false })
    );

    const result = await deactivateUser('1');
    expect(result.active).toBe(false);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.Operations[0].value).toBe(false);
  });
});

describe('getGroups', () => {
  it('fetches groups with pagination', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        totalResults: 1,
        startIndex: 1,
        itemsPerPage: 100,
        Resources: [{ id: 'g1', displayName: 'group-1', members: [] }],
      })
    );

    const groups = await getGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].displayName).toBe('group-1');
  });
});

describe('createGroup', () => {
  it('creates a group and returns it', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'new-g', displayName: 'new-group', members: [] }, 201)
    );

    const group = await createGroup('new-group');
    expect(group.id).toBe('new-g');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.displayName).toBe('new-group');
  });
});

describe('addGroupMember', () => {
  it('sends PATCH add operation', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await addGroupMember('g1', 'user-1');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.Operations[0].op).toBe('add');
    expect(body.Operations[0].value[0].value).toBe('user-1');
  });
});

describe('removeGroupMember', () => {
  it('sends PATCH remove operation', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await removeGroupMember('g1', 'user-1');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.Operations[0].op).toBe('remove');
    expect(body.Operations[0].path).toBe('members[value eq "user-1"]');
  });
});

describe('error handling', () => {
  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await expect(getUsers()).rejects.toThrow('SCIM API error 404');
  });

  it('retries on 429 and succeeds after backoff', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(
        jsonResponse({ totalResults: 1, startIndex: 1, itemsPerPage: 100, Resources: [
          { id: '1', userName: 'a@test.com', displayName: 'A', name: { givenName: 'A', familyName: 'B' }, emails: [{ value: 'a@test.com', primary: true }], active: true },
        ]})
      );

    const users = await getUsers();
    expect(users).toHaveLength(1);
    // First call got 429, second succeeded
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('throws after exhausting retries on repeated 429', async () => {
    // maxRetries is 3, so 4 total attempts (0,1,2,3). Each needs a fresh Response.
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response('Rate limited', { status: 429 }))
    );

    // After all retries, the 429 response is returned and scimJson throws
    await expect(getUsers()).rejects.toThrow('SCIM API error 429');
    expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
  }, 30_000);
});
