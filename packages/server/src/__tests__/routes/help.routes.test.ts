import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', async () => (await import('../helpers/mocks.js')).envMock());
vi.mock('../../lib/logger.js', async () => (await import('../helpers/mocks.js')).loggerMock());
vi.mock('../../services/jira.service.js', () => ({
  createHelpTicket: vi.fn(),
}));

// Both rate limiters live at module scope in help.routes.ts, so a fresh module
// registry per app gives every test its own untouched buckets (same pattern as
// claim.routes.test.ts).
async function makeApp() {
  vi.resetModules();
  const { helpRoutes } = await import('../../routes/help.routes.js');
  const { errorHandler } = await import('../../middleware/error.js');
  const jiraService = vi.mocked(await import('../../services/jira.service.js'));
  const { logger } = vi.mocked(await import('../../lib/logger.js'), true);
  jiraService.createHelpTicket.mockResolvedValue({ issueKey: 'HELP-1' });

  const app = express();
  app.use(express.json());
  app.use('/api/help', helpRoutes);
  app.use(errorHandler);
  return { app, createHelpTicket: jiraService.createHelpTicket, logger };
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
    const { app, createHelpTicket } = await makeApp();
    createHelpTicket.mockResolvedValue({ issueKey: 'HELP-42' });

    const res = await request(app).post('/api/help').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/has been submitted/);
    expect(createHelpTicket).toHaveBeenCalledWith(validBody);
  });

  it('returns an honest 502 HELP_TICKET_FAILED when ticket creation fails', async () => {
    const { app, createHelpTicket, logger } = await makeApp();
    createHelpTicket.mockRejectedValue(new Error('JSM 500'));

    const res = await request(app).post('/api/help').send(validBody);

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
    const { app, createHelpTicket } = await makeApp();

    const res = await request(app)
      .post('/api/help')
      .send({ ...validBody, fellowshipYear: 'next year' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(createHelpTicket).not.toHaveBeenCalled();
  });

  it('rate limits the 6th request from one IP with a coded body', async () => {
    const { app } = await makeApp();
    // Rotating contactEmail so the per-address limiter (3/day) never trips
    // first; a constant client keys one IP bucket (socket-address fallback).
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/help')
        .send({ ...validBody, contactEmail: `probe-${i}@example.org` });
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/help')
      .send({ ...validBody, contactEmail: 'probe-5@example.org' });

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.body.error).toMatch(/too many requests/i);
  });
});

// The JSM ticket is raised on behalf of contactEmail, so JSM notifies that
// mailbox. Without a per-address limiter, rotating IPs could direct unbounded
// JSM notification mail at an arbitrary third-party address — mirrors the
// claim route's claimEmailLimiter.
describe('POST /api/help — per-address rate limiter (3 per 24h per contactEmail)', () => {
  it('limits the 4th request for one address even from rotating IPs', async () => {
    const { app, createHelpTicket } = await makeApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/help')
        .set('CF-Connecting-IP', `198.51.100.${i + 1}`)
        .send({ ...validBody, contactEmail: 'victim@example.org' });
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/help')
      .set('CF-Connecting-IP', '198.51.100.99')
      .send({ ...validBody, contactEmail: 'victim@example.org' });

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    // The 4th request must never reach Jira (no 4th JSM notification email).
    expect(createHelpTicket).toHaveBeenCalledTimes(3);
  });

  it('keys on the normalized address — case variants share one bucket', async () => {
    const { app } = await makeApp();
    const variants = ['Victim@Example.org', 'VICTIM@example.org', 'victim@example.ORG'];
    for (const [i, contactEmail] of variants.entries()) {
      const res = await request(app)
        .post('/api/help')
        .set('CF-Connecting-IP', `198.51.100.${i + 10}`)
        .send({ ...validBody, contactEmail });
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/help')
      .set('CF-Connecting-IP', '198.51.100.50')
      .send({ ...validBody, contactEmail: 'victim@EXAMPLE.org' });

    expect(limited.status).toBe(429);
  });

  it('does not leak whether the limited address exists (fixed body, no extra fields)', async () => {
    const { app } = await makeApp();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/help')
        .set('CF-Connecting-IP', `198.51.100.${i + 20}`)
        .send({ ...validBody, contactEmail: 'x@example.org' });
    }

    const limited = await request(app)
      .post('/api/help')
      .set('CF-Connecting-IP', '198.51.100.60')
      .send({ ...validBody, contactEmail: 'x@example.org' });

    expect(limited.status).toBe(429);
    // Message must not vary by whether the address belongs to a fellow.
    expect(limited.body.error).toMatch(/too many requests for this address/i);
    expect(Object.keys(limited.body).sort()).toEqual(['code', 'error']);
  });

  it('a malformed payload never consumes the per-address budget', async () => {
    const { app, createHelpTicket } = await makeApp();
    // Mounted after validate: garbage requests are rejected before keying the
    // limiter, so they cannot be used to lock a victim's address out.
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/help')
        .set('CF-Connecting-IP', `198.51.100.${i + 30}`)
        .send({ ...validBody, contactEmail: 'y@example.org', fellowshipYear: 'bad' });
      expect(res.status).toBe(400);
    }

    const ok = await request(app)
      .post('/api/help')
      .set('CF-Connecting-IP', '198.51.100.70')
      .send({ ...validBody, contactEmail: 'y@example.org' });

    expect(ok.status).toBe(200);
    expect(createHelpTicket).toHaveBeenCalledTimes(1);
  });
});
