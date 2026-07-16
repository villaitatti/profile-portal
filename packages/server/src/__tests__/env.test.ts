import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

async function expectUnsafeProductionConfigToExit(extraEnv: Record<string, string>) {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/test',
    CORS_ORIGIN: 'https://portal.example',
    AUTH0_DOMAIN: 'tenant.example.auth0.com',
    AUTH0_AUDIENCE: 'https://api.example',
    AUTH0_M2M_CLIENT_ID: 'client-id',
    AUTH0_M2M_CLIENT_SECRET: 'client-secret',
    AUTH0_FELLOWS_ROLE_ID: 'role-id',
    CIVICRM_BASE_URL: 'https://civicrm.example',
    CIVICRM_API_KEY: 'api-key',
    CLAIM_VIT_ID_URL: 'https://portal.example/claim',
    PORTAL_PUBLIC_URL: 'https://portal.example',
    ...extraEnv,
  };
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit:1');
  }) as never);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  await expect(import('../env.js')).rejects.toThrow('process.exit:1');
  expect(exit).toHaveBeenCalledWith(1);
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining('Development authentication must not be enabled in production')
  );
}

describe('production environment safety', () => {
  it('rejects backend development authentication in production', async () => {
    await expectUnsafeProductionConfigToExit({ DEV_SKIP_EXTERNAL_SERVICES: 'true' });
  });

  it('rejects browser development authentication in production', async () => {
    await expectUnsafeProductionConfigToExit({
      DEV_SKIP_EXTERNAL_SERVICES: 'false',
      PUBLIC_DEV_SKIP_AUTH: 'true',
    });
  });
});
