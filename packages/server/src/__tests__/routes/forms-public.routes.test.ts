import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', () => ({
  env: { NODE_ENV: 'test' },
  isDevMode: false,
}));

vi.mock('../../services/form-invitation.service.js', async () => {
  // Mirror the real ServiceError, which extends HttpError so the error
  // middleware renders it with its own status and { error, code, details? }.
  // lib/http-error.js is safe to import here (no env/prisma side effects).
  const { HttpError } = await import('../../lib/http-error.js');
  class ServiceError extends HttpError {
    constructor(message: string, statusCode: number, details?: unknown) {
      super(statusCode, message, statusCode === 410 ? 'GONE' : 'REQUEST_ERROR', details);
      this.name = 'ServiceError';
    }
  }
  return {
    ServiceError,
    getInvitationByToken: vi.fn(),
    submitForm: vi.fn(),
  };
});

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { formsPublicRoutes } from '../../routes/forms-public.routes.js';
import { errorHandler } from '../../middleware/error.js';
import * as formService from '../../services/form-invitation.service.js';

const mockFormService = vi.mocked(formService);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/forms', formsPublicRoutes);
  app.use(errorHandler);
  return app;
}

const invitationResult = {
  invitation: {
    id: 'inv_1',
    tokenHash: 'c'.repeat(64),
    formType: 'fellow-memorandum-v3',
    status: 'submitted',
    submittedAt: new Date('2026-07-01T10:00:00.000Z'),
    expiresAt: new Date('2026-12-01T10:00:00.000Z'),
  },
  formDef: { id: 'fellow-memorandum-v3', title: 'Memorandum', sections: [] },
};

describe('public form routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns lifecycle metadata without submitted response PII', async () => {
    mockFormService.getInvitationByToken.mockResolvedValue(invitationResult as never);

    const response = await request(makeApp()).get('/api/forms/secret-token').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      id: 'inv_1',
      status: 'submitted',
      expiresAt: '2026-12-01T10:00:00.000Z',
    });
    expect(response.body).not.toHaveProperty('response');
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('tokenHash');
  });

  it('prevents caches from retaining invalid bearer-link responses', async () => {
    mockFormService.getInvitationByToken.mockResolvedValue(null);

    const response = await request(makeApp()).get('/api/forms/invalid-token').expect(404);

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 410 without invitation metadata for an expired bearer link', async () => {
    mockFormService.getInvitationByToken.mockRejectedValue(
      new formService.ServiceError('This form link has expired', 410)
    );

    const response = await request(makeApp()).get('/api/forms/expired-token').expect(410);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ error: 'This form link has expired', code: 'GONE' });
    expect(response.body).not.toHaveProperty('id');
    expect(response.body).not.toHaveProperty('submittedAt');
  });

  it('rate limits repeated submission attempts', async () => {
    mockFormService.submitForm.mockResolvedValue({ invitationId: 'inv_1', responseId: 'r_1' });
    const app = makeApp();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/api/forms/rate-limit-token').send({}).expect(201);
    }
    await request(app).post('/api/forms/rate-limit-token').send({}).expect(429);
  });
});
