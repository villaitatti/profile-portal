import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/form-invitation.service.js', () => {
  class ServiceError extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public details?: unknown
    ) {
      super(message);
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
import * as formService from '../../services/form-invitation.service.js';

const mockFormService = vi.mocked(formService);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/forms', formsPublicRoutes);
  return app;
}

const invitationResult = {
  invitation: {
    id: 'inv_1',
    token: 'secret-token',
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
    expect(response.body).toEqual({ error: 'This form link has expired' });
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
