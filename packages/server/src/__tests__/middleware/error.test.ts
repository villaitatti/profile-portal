import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../../middleware/error.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

function responseDouble() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('preserves an intentional client error message and code', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = responseDouble();
    errorHandler(
      Object.assign(new Error('Dry run has expired'), { status: 409, code: 'DRY_RUN_EXPIRED' }),
      {} as Request,
      res as unknown as Response,
      vi.fn() as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Dry run has expired',
      code: 'DRY_RUN_EXPIRED',
    });
  });

  it('does not expose a server exception in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = responseDouble();
    errorHandler(
      new Error('database password appeared here'),
      {} as Request,
      res as unknown as Response,
      vi.fn() as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  });
});
