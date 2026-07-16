import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AUTH0_NAMESPACE } from '@itatti/shared';

vi.mock('../../lib/prisma.js', () => ({
  prisma: { automationRun: { findMany: vi.fn(), findUnique: vi.fn() } },
}));

vi.mock('../../services/automation.service.js', () => ({
  runEndOfYearDryRun: vi.fn(),
  runNewCohortDryRun: vi.fn(),
  runBackfillDryRun: vi.fn(),
  executeAutomation: vi.fn(),
}));

import { automationAdminRoutes } from '../../routes/automation-admin.routes.js';
import * as automationService from '../../services/automation.service.js';

const mockAutomation = vi.mocked(automationService);

function makeApp(auth: Record<string, unknown>, userId = '') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = auth;
    req.userId = userId;
    next();
  });
  app.use('/api/admin/automations', automationAdminRoutes);
  return app;
}

describe('automation admin audit identity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses the namespaced access-token email for dry runs', async () => {
    mockAutomation.runEndOfYearDryRun.mockResolvedValue({ id: 'run-1' } as never);

    await request(
      makeApp({ [`${AUTH0_NAMESPACE}/email`]: 'admin@example.org', sub: 'auth0|123' })
    )
      .post('/api/admin/automations/end-of-year/dry-run')
      .expect(200);

    expect(mockAutomation.runEndOfYearDryRun).toHaveBeenCalledWith('admin:admin@example.org');
  });

  it('falls back to the extracted subject when email is unavailable', async () => {
    mockAutomation.executeAutomation.mockResolvedValue({ id: 'run-1' } as never);

    await request(makeApp({ sub: 'auth0|123' }, 'auth0|123'))
      .post('/api/admin/automations/end-of-year/execute/run-1')
      .expect(200);

    expect(mockAutomation.executeAutomation).toHaveBeenCalledWith(
      'run-1',
      'admin:auth0|123'
    );
  });

  it('returns 401 only when authentication produced no stable identity', async () => {
    await request(makeApp({})).post('/api/admin/automations/end-of-year/dry-run').expect(401);
    expect(mockAutomation.runEndOfYearDryRun).not.toHaveBeenCalled();
  });
});
