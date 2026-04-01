import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import type { Request, Response, NextFunction } from 'express';

const testSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('validate', () => {
  it('calls next() and sets parsed body on valid input', () => {
    const middleware = validate(testSchema);
    const req = mockReq({ email: 'test@example.com', name: 'Test' });
    const next = vi.fn();
    middleware(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'test@example.com', name: 'Test' });
  });

  it('returns 400 on invalid input', () => {
    const middleware = validate(testSchema);
    const res = mockRes();
    const next = vi.fn();
    middleware(mockReq({ email: 'not-an-email' }) as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when body is empty', () => {
    const middleware = validate(testSchema);
    const res = mockRes();
    const next = vi.fn();
    middleware(mockReq({}) as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
