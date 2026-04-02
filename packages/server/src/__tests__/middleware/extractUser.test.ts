import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock env before importing auth.ts (which imports env.ts at module level)
vi.mock('../../env.js', () => ({
  env: {
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_AUDIENCE: 'https://test',
    AUTH0_M2M_CLIENT_ID: 'test',
    AUTH0_M2M_CLIENT_SECRET: 'test',
    AUTH0_CONNECTION: 'Username-Password-Authentication',
    AUTH0_FELLOWS_ROLE_ID: 'test',
  },
  isDevMode: false,
}));

import { extractUser } from '../../middleware/auth.js';

const NAMESPACE = 'https://auth0.itatti.harvard.edu';

function mockReq(auth?: Record<string, unknown>): Partial<Request> {
  return { auth };
}

describe('extractUser', () => {
  it('extracts roles from JWT claims', () => {
    const req = mockReq({
      sub: 'auth0|123',
      [`${NAMESPACE}/roles`]: ['fellows', 'staff-it'],
      [`${NAMESPACE}/civicrm_id`]: '42',
    });
    const next = vi.fn();
    extractUser(req as Request, {} as Response, next);
    expect(req.userRoles).toEqual(['fellows', 'staff-it']);
    expect(req.userId).toBe('auth0|123');
    expect(req.civicrmId).toBe('42');
    expect(next).toHaveBeenCalled();
  });

  it('defaults to empty roles when no roles claim', () => {
    const req = mockReq({ sub: 'auth0|123' });
    const next = vi.fn();
    extractUser(req as Request, {} as Response, next);
    expect(req.userRoles).toEqual([]);
    expect(req.userId).toBe('auth0|123');
    expect(req.civicrmId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('defaults to empty string userId when no auth', () => {
    const req = mockReq(undefined);
    const next = vi.fn();
    extractUser(req as Request, {} as Response, next);
    expect(req.userRoles).toEqual([]);
    expect(req.userId).toBe('');
    expect(next).toHaveBeenCalled();
  });
});
