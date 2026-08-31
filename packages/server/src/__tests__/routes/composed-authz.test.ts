import { describe, it, expect, vi, beforeAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { AUTH0_NAMESPACE, KnownRoles } from '@itatti/shared';

/**
 * Composed authorization suite — the anti-"router mounted without
 * requireRole" test.
 *
 * Every other route test mounts its router directly, so none of them can
 * catch the one mistake that matters most here: an admin router added to
 * routes/index.ts without (or with the wrong) requireRole. This suite runs
 * the REAL registerRoutes() mounting with the real extractUser and the real
 * requireRole, and probes every protected prefix:
 *
 *   - no Authorization header       -> 401 (whole prefix, any subpath)
 *   - authenticated, no roles       -> 403 on admin prefixes
 *   - authenticated, the WRONG role -> 403 on admin prefixes
 *   - authenticated, a correct role -> past the gate (404 on a probe path,
 *     proving the request reached the router rather than a gate)
 *
 * Only the JWT *verification* is faked (we cannot mint Auth0 RS256 tokens in
 * unit tests): the express-jwt mock decodes `Bearer <base64 JSON payload>`
 * into req.auth, and rejects missing/undecodable tokens with a 401 error
 * exactly like the real middleware. Everything downstream of req.auth —
 * extractUser, requireRole, the mount table — is the production code.
 */

vi.mock('express-jwt', () => ({
  expressjwt: () => (req: any, _res: any, next: any) => {
    const header: string | undefined = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      const err: any = new Error('No authorization token was found');
      err.status = 401;
      err.code = 'credentials_required';
      return next(err);
    }
    try {
      req.auth = JSON.parse(Buffer.from(header.slice(7), 'base64').toString('utf8'));
    } catch {
      const err: any = new Error('Invalid token');
      err.status = 401;
      err.code = 'invalid_token';
      return next(err);
    }
    next();
  },
}));

// Quiet the request logger; keep everything else real.
vi.mock('../../lib/logger.js', async () => (await import('../helpers/mocks.js')).loggerMock());

function bearer(roles: string[]): string {
  const payload = {
    sub: 'auth0|composed-test',
    [`${AUTH0_NAMESPACE}/roles`]: roles,
    [`${AUTH0_NAMESPACE}/app_metadata`]: { civicrm_id: '42' },
  };
  return `Bearer ${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

let app: Express;

beforeAll(async () => {
  // The real env module boots from process.env; give it a complete valid
  // test configuration BEFORE any dynamic import pulls it in.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost:5499/composed-authz-test',
    AUTH0_DOMAIN: 'tenant.test.auth0.com',
    AUTH0_AUDIENCE: 'https://api.test',
    AUTH0_M2M_CLIENT_ID: 'client-id',
    AUTH0_M2M_CLIENT_SECRET: 'client-secret',
    AUTH0_FELLOWS_ROLE_ID: 'role-id',
    CIVICRM_BASE_URL: 'https://civicrm.test',
    CIVICRM_API_KEY: 'api-key',
    CLAIM_VIT_ID_URL: 'https://portal.test/claim',
    PORTAL_PUBLIC_URL: 'https://portal.test',
  });

  const { registerRoutes } = await import('../../routes/index.js');
  const { errorHandler } = await import('../../middleware/error.js');

  app = express();
  app.use(express.json());
  await registerRoutes(app);
  app.use(errorHandler);
});

// Path that exists under no router: with the right role the gates pass and
// Express falls through to 404 — proving the request REACHED the router.
const PROBE = '__authz-probe__';

const ADMIN_MOUNTS: Array<{ mount: string; allowed: string[]; denied: string[] }> = [
  {
    mount: '/api/admin/fellows',
    allowed: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS, KnownRoles.FELLOWS_CURRENT],
  },
  {
    mount: '/api/admin/claims',
    allowed: [KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS_ADMIN, KnownRoles.FELLOWS],
  },
  {
    mount: '/api/admin/automations',
    allowed: [KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS_ADMIN, KnownRoles.FELLOWS],
  },
  {
    mount: '/api/admin/emails',
    allowed: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS, KnownRoles.FELLOWS_CURRENT],
  },
  {
    mount: '/api/admin/forms',
    allowed: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS, KnownRoles.FELLOWS_CURRENT],
  },
  {
    mount: '/api/admin/uploads/images',
    allowed: [KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS_ADMIN, KnownRoles.FELLOWS],
  },
  {
    mount: '/api/admin/sync',
    allowed: [KnownRoles.STAFF_IT],
    denied: [KnownRoles.FELLOWS_ADMIN, KnownRoles.FELLOWS],
  },
];

const AUTHENTICATED_MOUNTS = [
  '/api/profile',
  '/api/profile/contact',
  '/api/roles',
];

describe('admin mounts', () => {
  for (const { mount, allowed, denied } of ADMIN_MOUNTS) {
    describe(mount, () => {
      it('rejects unauthenticated requests with 401', async () => {
        const res = await request(app).get(`${mount}/${PROBE}`);
        expect(res.status).toBe(401);
      });

      it('rejects an authenticated user with NO roles with 403', async () => {
        const res = await request(app)
          .get(`${mount}/${PROBE}`)
          .set('Authorization', bearer([]));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      });

      for (const role of denied) {
        it(`rejects role "${role}" with 403`, async () => {
          const res = await request(app)
            .get(`${mount}/${PROBE}`)
            .set('Authorization', bearer([role]));
          expect(res.status).toBe(403);
        });
      }

      for (const role of allowed) {
        it(`lets role "${role}" through the gate (probe 404s inside the router)`, async () => {
          const res = await request(app)
            .get(`${mount}/${PROBE}`)
            .set('Authorization', bearer([role]));
          expect(res.status).toBe(404);
        });
      }
    });
  }
});

describe('POST /api/admin/vit-id-lookup (exact-path admin route)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/admin/vit-id-lookup').send({ q: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects a plain fellow with 403', async () => {
    const res = await request(app)
      .post('/api/admin/vit-id-lookup')
      .set('Authorization', bearer([KnownRoles.FELLOWS]))
      .send({ q: 'x' });
    expect(res.status).toBe(403);
  });

  it('lets fellows-admin past the gate (reaches the handler)', async () => {
    // An invalid body proves the request got PAST auth into validation.
    const res = await request(app)
      .post('/api/admin/vit-id-lookup')
      .set('Authorization', bearer([KnownRoles.FELLOWS_ADMIN]))
      .send({});
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('authenticated (non-admin) mounts', () => {
  for (const mount of AUTHENTICATED_MOUNTS) {
    it(`${mount} rejects unauthenticated requests with 401`, async () => {
      const res = await request(app).get(`${mount}/${PROBE}`);
      expect(res.status).toBe(401);
    });

    it(`${mount} admits any authenticated user (no role gate by design)`, async () => {
      const res = await request(app)
        .get(`${mount}/${PROBE}`)
        .set('Authorization', bearer([]));
      expect(res.status).toBe(404);
    });
  }
});

describe('/api/applications (mixed router: list is authenticated, item routes are staff-IT)', () => {
  // The probe path matches the router's GET /:id param route, which carries
  // its own requireRole(STAFF_IT) — so this mount is asserted per-gate.
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get(`/api/applications/${PROBE}`);
    expect(res.status).toBe(401);
  });

  it('item routes reject a role-less authenticated user with 403', async () => {
    const res = await request(app)
      .get(`/api/applications/${PROBE}`)
      .set('Authorization', bearer([]));
    expect(res.status).toBe(403);
  });

  it('item routes admit staff-IT past the gate', async () => {
    const res = await request(app)
      .get(`/api/applications/${PROBE}`)
      .set('Authorization', bearer([KnownRoles.STAFF_IT]));
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('public mounts stay public', () => {
  for (const mount of ['/api/health', '/api/config', '/api/claim', '/api/help', '/api/forms']) {
    it(`${mount} does not demand authentication`, async () => {
      const res = await request(app).get(`${mount}/${PROBE}`);
      expect(res.status).not.toBe(401);
    });
  }
});

describe('mount-table completeness', () => {
  it('every /api/admin prefix mounted in registerRoutes is covered by this suite', async () => {
    // Guard against a NEW admin mount being added without a row in
    // ADMIN_MOUNTS above: parse the mounting source for admin prefixes.
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const source = await readFile(
      fileURLToPath(new URL('../../routes/index.ts', import.meta.url)),
      'utf8'
    );
    const mounted = [...source.matchAll(/'(\/api\/admin\/[^']+)'/g)].map((m) => m[1]);
    const covered = new Set([...ADMIN_MOUNTS.map((m) => m.mount), '/api/admin/vit-id-lookup']);
    for (const prefix of mounted) {
      expect(covered, `add ${prefix} to ADMIN_MOUNTS in this suite`).toContain(prefix);
    }
    expect(mounted.length).toBeGreaterThanOrEqual(covered.size);
  });
});
