import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

const baseValidEnv: Record<string, string> = {
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
};

/** Boot env.ts with the given vars on top of a minimal valid set. */
async function bootEnv(extraEnv: Record<string, string>, nodeEnv = 'test') {
  process.env = { ...originalEnv, NODE_ENV: nodeEnv, ...baseValidEnv, ...extraEnv };
  // env.ts caches its parse result at module scope; resetModules in afterEach
  // makes each import a fresh boot.
  return import('../env.js');
}

async function expectBootToExit(
  extraEnv: Record<string, string>,
  expectedMessage: string,
  nodeEnv = 'test'
) {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit:1');
  }) as never);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  await expect(bootEnv(extraEnv, nodeEnv)).rejects.toThrow('process.exit:1');
  expect(exit).toHaveBeenCalledWith(1);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining(expectedMessage));
}

async function expectUnsafeProductionConfigToExit(extraEnv: Record<string, string>) {
  await expectBootToExit(
    extraEnv,
    'Development authentication must not be enabled in production',
    'production'
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

// These two settings exist specifically to turn silent misconfiguration into
// a boot failure (NaN trust proxy breaks every rate limiter; a typo'd log
// level used to be silently ignored). Pin both directions: bad values exit,
// empty/unset fall back to safe defaults.
describe('TRUST_PROXY_HOPS validation', () => {
  it('rejects a non-numeric value at boot', async () => {
    await expectBootToExit({ TRUST_PROXY_HOPS: 'abc' }, 'TRUST_PROXY_HOPS');
  });

  it('rejects a negative value at boot', async () => {
    await expectBootToExit({ TRUST_PROXY_HOPS: '-1' }, 'TRUST_PROXY_HOPS');
  });

  it('rejects a fractional value at boot', async () => {
    await expectBootToExit({ TRUST_PROXY_HOPS: '1.5' }, 'TRUST_PROXY_HOPS');
  });

  it('defaults to 1 when unset', async () => {
    const { env } = await bootEnv({});
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('defaults to 1 when set to an empty string (dotenv TRUST_PROXY_HOPS=)', async () => {
    const { env } = await bootEnv({ TRUST_PROXY_HOPS: '' });
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('accepts 0 (no proxy) and larger hop counts', async () => {
    expect((await bootEnv({ TRUST_PROXY_HOPS: '0' })).env.TRUST_PROXY_HOPS).toBe(0);
    vi.resetModules();
    expect((await bootEnv({ TRUST_PROXY_HOPS: '2' })).env.TRUST_PROXY_HOPS).toBe(2);
  });
});

describe('LOG_LEVEL validation', () => {
  it('rejects an unknown level at boot', async () => {
    await expectBootToExit({ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL');
  });

  it('accepts every pino level', async () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']) {
      vi.resetModules();
      const { env } = await bootEnv({ LOG_LEVEL: level });
      expect(env.LOG_LEVEL).toBe(level);
    }
  });

  it('tolerates unset and empty string', async () => {
    expect((await bootEnv({})).env.LOG_LEVEL).toBeUndefined();
    vi.resetModules();
    expect((await bootEnv({ LOG_LEVEL: '' })).env.LOG_LEVEL).toBe('');
  });
});
