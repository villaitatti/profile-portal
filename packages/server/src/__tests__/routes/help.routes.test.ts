import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', () => ({
  env: { NODE_ENV: 'test' },
  isDevMode: false,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../services/jira.service.js', () => ({
  createHelpTicket: vi.fn(),
}));

import { helpRoutes } from '../../routes/help.routes.js';
import { errorHandler } from '../../middleware/error.js';
import * as jiraService from '../../services/jira.service.js';
import { logger } from '../../lib/logger.js';

const mockJira = vi.mocked(jiraService);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/help', helpRoutes);
  app.use(errorHandler);
  return app;
}

const validBody = {
  fullName: 'Bernard Berenson',
  contactEmail: 'bb@example.org',
  fellowshipYear: '2026-2027',
  message: 'I cannot access my profile.',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/help', () => {
  it('returns the generic confirmation when the Jira ticket is created', async () => {
    mockJira.createHelpTicket.mockResolvedValue({ issueKey: 'HELP-42' });

    const res = await request(makeApp()).post('/api/help').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/has been submitted/);
    expect(mockJira.createHelpTicket).toHaveBeenCalledWith(validBody);
  });

  it('returns an honest 502 HELP_TICKET_FAILED when ticket creation fails', async () => {
    mockJira.createHelpTicket.mockRejectedValue(new Error('JSM 500'));

    const res = await request(makeApp()).post('/api/help').send(validBody);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('HELP_TICKET_FAILED');
    expect(res.body.error).toMatch(/could not submit/i);
    // Must never claim success in the same breath.
    expect(res.body.message).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to create help ticket'
    );
  });

  it('rejects an invalid payload with 400 before touching Jira', async () => {
    const res = await request(makeApp())
      .post('/api/help')
      .send({ ...validBody, fellowshipYear: 'next year' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockJira.createHelpTicket).not.toHaveBeenCalled();
  });

  it('rate limits after 5 requests in the window with a coded body', async () => {
    mockJira.createHelpTicket.mockResolvedValue({ issueKey: 'HELP-1' });
    // The limiter is module-scoped, so requests from the tests above already
    // count against the 5-per-window budget. Send until it trips (bounded by
    // the window size + 1) and assert the limited response's contract.
    const app = makeApp();
    let limited;
    for (let i = 0; i <= 5; i++) {
      const res = await request(app).post('/api/help').send(validBody);
      if (res.status === 429) {
        limited = res;
        break;
      }
      expect(res.status).toBe(200);
    }

    expect(limited).toBeDefined();
    expect(limited!.status).toBe(429);
    expect(limited!.body.code).toBe('RATE_LIMITED');
    expect(limited!.body.error).toMatch(/too many requests/i);
  });
});
