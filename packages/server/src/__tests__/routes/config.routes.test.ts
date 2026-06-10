import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const viteEnvKeys = [
  'VITE_AUTH0_DOMAIN',
  'VITE_AUTH0_CLIENT_ID',
  'VITE_AUTH0_AUDIENCE',
  'VITE_AUTH0_CALLBACK_URL',
  'VITE_AUTH0_NAMESPACE',
  'VITE_API_BASE_URL',
  'VITE_CIVICRM_URL',
  'VITE_DEV_SKIP_AUTH',
];

const originalViteEnv = Object.fromEntries(
  viteEnvKeys.map((key) => [key, process.env[key]])
);

const baseEnv = {
  AUTH0_DOMAIN: 'server.auth0.example',
  AUTH0_AUDIENCE: 'https://server-api.example',
  PORTAL_PUBLIC_URL: 'https://portal.example',
  PUBLIC_DEV_SKIP_AUTH: false,
};

async function makeApp(envOverride: Record<string, unknown> = {}) {
  vi.doMock('../../env.js', () => ({
    env: { ...baseEnv, ...envOverride },
  }));

  const { configRoutes } = await import('../../routes/config.routes.js');
  const app = express();
  app.use('/api/config', configRoutes);
  return app;
}

describe('GET /api/config', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of viteEnvKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of viteEnvKeys) {
      const value = originalViteEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns only browser-safe runtime config', async () => {
    process.env.VITE_API_BASE_URL = 'https://legacy-api.example';

    const app = await makeApp({
      PUBLIC_AUTH0_DOMAIN: 'public.auth0.example',
      PUBLIC_AUTH0_CLIENT_ID: 'public-client-id',
      PUBLIC_AUTH0_AUDIENCE: 'https://public-api.example',
      PUBLIC_AUTH0_CALLBACK_URL: 'https://portal.example/callback',
      PUBLIC_AUTH0_NAMESPACE: 'https://claims.example',
      PUBLIC_API_BASE_URL: '',
      PUBLIC_CIVICRM_URL: 'https://crm.example',
      PUBLIC_DEV_SKIP_AUTH: true,
      AUTH0_M2M_CLIENT_SECRET: 'must-not-leak',
    });

    const res = await request(app).get('/api/config').expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      auth0Domain: 'public.auth0.example',
      auth0ClientId: 'public-client-id',
      auth0Audience: 'https://public-api.example',
      auth0CallbackUrl: 'https://portal.example/callback',
      auth0Namespace: 'https://claims.example',
      apiBaseUrl: '',
      civicrmUrl: 'https://crm.example',
      devSkipAuth: true,
    });
    expect(res.body).not.toHaveProperty('AUTH0_M2M_CLIENT_SECRET');
  });

  it('falls back to legacy VITE values and server Auth0 values', async () => {
    process.env.VITE_AUTH0_CLIENT_ID = 'legacy-client-id';
    process.env.VITE_AUTH0_NAMESPACE = 'https://legacy-claims.example';
    process.env.VITE_API_BASE_URL = 'https://api.example';
    process.env.VITE_DEV_SKIP_AUTH = 'true';

    const app = await makeApp();
    const res = await request(app).get('/api/config').expect(200);

    expect(res.body).toMatchObject({
      auth0Domain: 'server.auth0.example',
      auth0ClientId: 'legacy-client-id',
      auth0Audience: 'https://server-api.example',
      auth0CallbackUrl: 'https://portal.example/callback',
      auth0Namespace: 'https://legacy-claims.example',
      apiBaseUrl: 'https://api.example',
      devSkipAuth: true,
    });
  });
});
