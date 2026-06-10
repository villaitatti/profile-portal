import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getApiBaseUrl,
  getCivicrmUrl,
  getRuntimeConfig,
  loadRuntimeConfig,
  setRuntimeConfigForTests,
} from '../../config/runtime';

const originalFetch = globalThis.fetch;

describe('runtime config', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    setRuntimeConfigForTests({});
    vi.restoreAllMocks();
  });

  it('loads browser config from /api/config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        auth0Domain: 'tenant.auth0.example',
        auth0ClientId: 'client-id',
        auth0Audience: 'https://api.example',
        auth0CallbackUrl: 'https://portal.example/callback',
        auth0Namespace: 'https://claims.example',
        apiBaseUrl: 'https://portal.example',
        civicrmUrl: 'https://crm.example',
        devSkipAuth: true,
      }),
    });
    globalThis.fetch = fetchMock as any;

    const config = await loadRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledWith('/api/config', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    expect(config).toMatchObject({
      auth0Domain: 'tenant.auth0.example',
      auth0ClientId: 'client-id',
      apiBaseUrl: 'https://portal.example',
      civicrmUrl: 'https://crm.example',
      devSkipAuth: true,
    });
    expect(getApiBaseUrl()).toBe('https://portal.example');
    expect(getCivicrmUrl()).toBe('https://crm.example');
  });

  it('falls back to local Vite config when /api/config is unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('server offline')) as any;

    const config = await loadRuntimeConfig();

    expect(config.auth0CallbackUrl).toContain('/callback');
    expect(getRuntimeConfig()).toBe(config);
  });
});
