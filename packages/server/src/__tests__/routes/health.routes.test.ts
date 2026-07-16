import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: { $queryRaw: vi.fn() },
}));
vi.mock('../../lib/job-queue.js', () => ({
  isJobQueueReady: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ access: vi.fn() }));

import { healthRoutes } from '../../routes/health.routes.js';
import { prisma } from '../../lib/prisma.js';
import { isJobQueueReady } from '../../lib/job-queue.js';
import { access } from 'node:fs/promises';

const mockPrisma = vi.mocked(prisma, true);
const mockQueueReady = vi.mocked(isJobQueueReady);
const mockAccess = vi.mocked(access);

function makeApp() {
  const app = express();
  app.use('/api/health', healthRoutes);
  return app;
}

describe('health routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockAccess.mockResolvedValue(undefined);
    mockQueueReady.mockReturnValue(true);
  });

  it('reports readiness only when database, queue, and upload storage are ready', async () => {
    const response = await request(makeApp()).get('/api/health/ready').expect(200);
    expect(response.body.status).toBe('ready');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 when a required internal dependency is unavailable', async () => {
    mockQueueReady.mockReturnValue(false);
    const response = await request(makeApp()).get('/api/health/ready').expect(503);
    expect(response.body).toEqual({ status: 'not_ready' });
  });
});
