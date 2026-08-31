import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', async () => (await import('../helpers/mocks.js')).envMock());
vi.mock('../../lib/logger.js', async () => (await import('../helpers/mocks.js')).loggerMock());
vi.mock('../../services/claim.service.js', () => ({
  processClaim: vi.fn(),
}));

const GENERIC_MESSAGE = 'If you are eligible, you will receive an email with next steps.';

// Both rate limiters live at module scope in claim.routes.ts, so a fresh
// module registry per app gives every test its own untouched buckets.
async function makeApp() {
  vi.resetModules();
  const { claimRoutes } = await import('../../routes/claim.routes.js');
  const { errorHandler } = await import('../../middleware/error.js');
  const claimService = vi.mocked(await import('../../services/claim.service.js'));
  const { logger } = vi.mocked(await import('../../lib/logger.js'), true);
  claimService.processClaim.mockResolvedValue(undefined as never);

  const app = express();
  app.use(express.json());
  app.use('/api/claim', claimRoutes);
  app.use(errorHandler);
  return { app, processClaim: claimService.processClaim, logger };
}

// The handler answers at a FIXED 2s deadline (anti-timing-oracle), so tests
// fake setTimeout and drive the clock instead of sleeping for real. Date is
// left real: the handler's `deadline - elapsed` math sees ~0ms elapsed, and
// advancing 2000+ fake ms always releases the response.
async function postClaim(
  app: express.Express,
  body: unknown,
  headers: Record<string, string> = {}
) {
  let response: request.Response | undefined;
  const pending = request(app)
    .post('/api/claim')
    .set(headers)
    .send(body as object)
    .then((r) => {
      response = r;
      return r;
    });
  // Alternate real IO ticks (lets the request reach the handler / the
  // response reach supertest) with fake-clock advances (releases the sleeps).
  for (let i = 0; i < 50 && !response; i++) {
    await new Promise((r) => setImmediate(r));
    if (vi.getTimerCount() > 0) await vi.advanceTimersByTimeAsync(2100);
  }
  return pending;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Date must be faked WITH setTimeout: the handler computes
  // `deadline - (Date.now() - start)`, and a real Date against a fake clock
  // would mismeasure the elapsed time.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/claim — validation', () => {
  it.each([
    ['missing email', {}],
    ['malformed email', { email: 'not-an-email' }],
    ['overlong email', { email: `${'a'.repeat(250)}@example.com` }],
  ])('rejects %s with 400 and never starts the claim flow', async (_label, body) => {
    const { app, processClaim } = await makeApp();
    const res = await postClaim(app, body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(processClaim).not.toHaveBeenCalled();
  });

  it('lowercases the address before the service sees it', async () => {
    // (Leading/trailing whitespace never reaches the transform — .email()
    // rejects it as 400 first, which the case above covers.)
    const { app, processClaim } = await makeApp();
    const res = await postClaim(app, { email: 'Fellow@Example.COM' });
    expect(res.status).toBe(200);
    expect(processClaim).toHaveBeenCalledWith('fellow@example.com');
  });
});

describe('POST /api/claim — anti-enumeration response', () => {
  it('returns the identical generic body when the claim succeeds', async () => {
    const { app } = await makeApp();
    const res = await postClaim(app, { email: 'known@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_MESSAGE });
  });

  it('returns the identical generic body when the claim flow throws', async () => {
    const { app, processClaim } = await makeApp();
    processClaim.mockRejectedValue(new Error('Auth0 exploded'));
    const res = await postClaim(app, { email: 'anyone@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC_MESSAGE });
  });

  it('logs claim-flow failures with a masked address, never the full email', async () => {
    const { app, processClaim, logger } = await makeApp();
    processClaim.mockRejectedValue(new Error('boom'));
    await postClaim(app, { email: 'secretperson@example.com' });

    expect(logger.error).toHaveBeenCalled();
    const [context] = logger.error.mock.calls[0];
    expect(context).toMatchObject({ emailPrefix: 'sec***' });
    expect(JSON.stringify(context)).not.toContain('secretperson@example.com');
  });
});

describe('POST /api/claim — fixed-deadline timing', () => {
  async function timeToResolve(work: Promise<unknown>): Promise<{
    resolvedAt1999: boolean;
    resolvedAt2000: boolean;
  }> {
    let done = false;
    void work.then(() => {
      done = true;
    });
    // Let the request reach the handler before advancing the clock.
    for (let i = 0; i < 50 && vi.getTimerCount() === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    await vi.advanceTimersByTimeAsync(1999);
    await new Promise((r) => setImmediate(r));
    const resolvedAt1999 = done;
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 50 && !done; i++) {
      await new Promise((r) => setImmediate(r));
      if (vi.getTimerCount() > 0) await vi.advanceTimersByTimeAsync(1);
    }
    return { resolvedAt1999, resolvedAt2000: done };
  }

  it('a fast claim flow does not answer before the 2s deadline', async () => {
    const { app } = await makeApp(); // processClaim resolves instantly
    const pending = request(app)
      .post('/api/claim')
      .send({ email: 'fast@example.com' })
      .then((r) => r);

    const timing = await timeToResolve(pending);
    expect(timing.resolvedAt1999).toBe(false);
    expect(timing.resolvedAt2000).toBe(true);
    expect((await pending).body).toEqual({ message: GENERIC_MESSAGE });
  });

  it('a slow claim flow is not awaited past the deadline (answers at 2s anyway)', async () => {
    const { app, processClaim } = await makeApp();
    processClaim.mockImplementation(() => new Promise(() => {}) as never); // never settles
    const pending = request(app)
      .post('/api/claim')
      .send({ email: 'slow@example.com' })
      .then((r) => r);

    const timing = await timeToResolve(pending);
    expect(timing.resolvedAt1999).toBe(false);
    expect(timing.resolvedAt2000).toBe(true);
    expect((await pending).body).toEqual({ message: GENERIC_MESSAGE });
  });
});

describe('POST /api/claim — IP rate limiter (5 per 15min per client IP)', () => {
  it('limits the 6th request from one IP with 429 RATE_LIMITED', async () => {
    const { app, processClaim } = await makeApp();
    // Distinct addresses per request so the email limiter (3/day per address)
    // never trips first; constant CF-Connecting-IP keys the IP bucket.
    for (let i = 0; i < 5; i++) {
      const res = await postClaim(
        app,
        { email: `probe-${i}@example.com` },
        { 'CF-Connecting-IP': '203.0.113.7' }
      );
      expect(res.status).toBe(200);
    }
    const limited = await postClaim(
      app,
      { email: 'probe-5@example.com' },
      { 'CF-Connecting-IP': '203.0.113.7' }
    );
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
    expect(processClaim).toHaveBeenCalledTimes(5);
  });

  it('a different client IP still has its own budget', async () => {
    const { app } = await makeApp();
    for (let i = 0; i < 5; i++) {
      await postClaim(app, { email: `a-${i}@example.com` }, { 'CF-Connecting-IP': '203.0.113.8' });
    }
    const other = await postClaim(
      app,
      { email: 'b@example.com' },
      { 'CF-Connecting-IP': '203.0.113.9' }
    );
    expect(other.status).toBe(200);
  });
});

describe('POST /api/claim — per-address rate limiter (3 per 24h per target email)', () => {
  it('limits the 4th claim for one address even from rotating IPs', async () => {
    const { app, processClaim } = await makeApp();
    for (let i = 0; i < 3; i++) {
      const res = await postClaim(
        app,
        { email: 'victim@example.com' },
        { 'CF-Connecting-IP': `198.51.100.${i + 1}` }
      );
      expect(res.status).toBe(200);
    }
    const limited = await postClaim(
      app,
      { email: 'victim@example.com' },
      { 'CF-Connecting-IP': '198.51.100.99' }
    );
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(processClaim).toHaveBeenCalledTimes(3);
  });

  it('keys on the NORMALIZED address — case variants share one bucket', async () => {
    const { app } = await makeApp();
    const variants = ['Victim@Example.com', 'VICTIM@example.com', 'victim@example.COM'];
    for (const [i, email] of variants.entries()) {
      const res = await postClaim(app, { email }, { 'CF-Connecting-IP': `198.51.100.${i + 10}` });
      expect(res.status).toBe(200);
    }
    const limited = await postClaim(
      app,
      { email: 'victim@EXAMPLE.com' },
      { 'CF-Connecting-IP': '198.51.100.50' }
    );
    expect(limited.status).toBe(429);
  });

  it('does not leak whether the limited address exists (fixed body, no extra fields)', async () => {
    const { app } = await makeApp();
    for (let i = 0; i < 3; i++) {
      await postClaim(app, { email: 'x@example.com' }, { 'CF-Connecting-IP': `198.51.100.${i + 20}` });
    }
    const limited = await postClaim(
      app,
      { email: 'x@example.com' },
      { 'CF-Connecting-IP': '198.51.100.60' }
    );
    expect(limited.status).toBe(429);
    // Message must not vary by whether the address matched a fellow.
    expect(limited.body.error).toMatch(/too many requests for this address/i);
    expect(Object.keys(limited.body).sort()).toEqual(['code', 'error']);
  });
});
