import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../../middleware/rbac.js';
import type { Request, Response, NextFunction } from 'express';

function mockReq(userRoles: string[] = []): Partial<Request> {
  return { userRoles };
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireRole', () => {
  it('calls next() when user has a matching role', () => {
    const middleware = requireRole('staff-it');
    const next = vi.fn();
    middleware(mockReq(['staff-it']) as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user has no roles', () => {
    const middleware = requireRole('staff-it');
    const next = vi.fn();
    const res = mockRes();
    middleware(mockReq([]) as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has wrong role', () => {
    const middleware = requireRole('staff-it');
    const next = vi.fn();
    const res = mockRes();
    middleware(mockReq(['fellows']) as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has one of multiple allowed roles', () => {
    const middleware = requireRole('fellows-admin', 'staff-it');
    const next = vi.fn();
    middleware(mockReq(['fellows-admin']) as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when userRoles is undefined', () => {
    const middleware = requireRole('staff-it');
    const next = vi.fn();
    const res = mockRes();
    middleware({ userRoles: undefined } as unknown as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
