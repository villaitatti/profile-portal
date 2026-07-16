import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { KnownRoles } from '@itatti/shared';

vi.mock('../../services/applications.service.js', () => ({
  listApplications: vi.fn(),
  getApplication: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));

import { applicationsRoutes } from '../../routes/applications.routes.js';
import * as service from '../../services/applications.service.js';

const mockService = vi.mocked(service);

function makeApp(roles: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userRoles = roles;
    next();
  });
  app.use('/api/applications', applicationsRoutes);
  return app;
}

describe('GET /api/applications/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not expose directly addressed applications to regular users', async () => {
    await request(makeApp([KnownRoles.FELLOWS])).get('/api/applications/42').expect(403);
    expect(mockService.getApplication).not.toHaveBeenCalled();
  });

  it('allows staff to load an application for editing', async () => {
    mockService.getApplication.mockResolvedValue({ id: 42, name: 'Internal app' } as never);

    const response = await request(makeApp([KnownRoles.STAFF_IT]))
      .get('/api/applications/42')
      .expect(200);

    expect(response.body).toMatchObject({ id: 42, name: 'Internal app' });
    expect(mockService.getApplication).toHaveBeenCalledWith(42);
  });
});
