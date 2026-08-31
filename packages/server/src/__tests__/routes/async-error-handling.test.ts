import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', () => ({
  env: { NODE_ENV: 'test' },
  isDevMode: false,
}));

vi.mock('../../middleware/rbac.js', () => ({
  requireRole: (..._roles: string[]) =>
    (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../services/applications.service.js', () => ({
  listApplications: vi.fn(),
  getApplication: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));

import { applicationsRoutes } from '../../routes/applications.routes.js';
import { errorHandler } from '../../middleware/error.js';
import * as service from '../../services/applications.service.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'test-user';
    (req as any).userRoles = ['staff-IT'];
    next();
  });
  app.use('/api/applications', applicationsRoutes);
  app.use(errorHandler);
  return app;
}

/**
 * Pins the contract that a rejected async handler produces a 500 through the
 * error middleware instead of crashing the process. Under Express 4 (the
 * runtime when these tests were written) that required explicit
 * try/catch → next(err) in every handler; the runtime is now Express 5, whose
 * router forwards async rejections to the error middleware natively.
 *
 * The tests are deliberately behavioural (assert the 500 response) rather than
 * asserting the presence of a try/catch, so they keep pinning the contract no
 * matter which mechanism provides it — a downgrade or a router swap that loses
 * native forwarding would fail here.
 */
describe('async route handler rejections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes a rejected list handler to the error middleware instead of crashing', async () => {
    vi.mocked(service.listApplications).mockRejectedValue(
      new Error('simulated database failure')
    );

    const res = await request(makeApp()).get('/api/applications');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('routes a rejected detail handler to the error middleware', async () => {
    vi.mocked(service.getApplication).mockRejectedValue(new Error('boom'));

    const res = await request(makeApp()).get('/api/applications/1');

    expect(res.status).toBe(500);
  });

  it('routes a rejected create handler to the error middleware', async () => {
    vi.mocked(service.createApplication).mockRejectedValue(new Error('boom'));

    const res = await request(makeApp())
      .post('/api/applications')
      .send({
        name: 'Test',
        url: 'https://example.com',
        loginMethod: 'vit-id',
        requiredRoles: ['fellows'],
      });

    expect(res.status).toBe(500);
  });

  it('rejects a non-numeric id with 400 rather than passing NaN to Prisma', async () => {
    const res = await request(makeApp()).get('/api/applications/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
    expect(service.getApplication).not.toHaveBeenCalled();
  });

  it('rejects a non-http tile url', async () => {
    const res = await request(makeApp())
      .post('/api/applications')
      .send({
        name: 'Test',
        url: 'javascript:alert(1)',
        loginMethod: 'none',
        requiredRoles: ['fellows'],
      });

    expect(res.status).toBe(400);
    expect(service.createApplication).not.toHaveBeenCalled();
  });
});
