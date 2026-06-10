export interface RuntimeConfig {
  auth0Domain: string;
  auth0ClientId: string;
  auth0Audience: string;
  auth0CallbackUrl: string;
  auth0Namespace: string;
  apiBaseUrl: string;
  civicrmUrl: string;
  devSkipAuth: boolean;
}

function fallbackConfig(): RuntimeConfig {
  return {
    auth0Domain: import.meta.env.VITE_AUTH0_DOMAIN || '',
    auth0ClientId: import.meta.env.VITE_AUTH0_CLIENT_ID || '',
    auth0Audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
    auth0CallbackUrl: import.meta.env.VITE_AUTH0_CALLBACK_URL || `${window.location.origin}/callback`,
    auth0Namespace: import.meta.env.VITE_AUTH0_NAMESPACE || 'https://auth0.itatti.harvard.edu',
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
    civicrmUrl: import.meta.env.VITE_CIVICRM_URL || '',
    devSkipAuth: import.meta.env.VITE_DEV_SKIP_AUTH === 'true',
  };
}

let runtimeConfig = fallbackConfig();

function coerceConfig(value: Partial<RuntimeConfig>): RuntimeConfig {
  const fallback = fallbackConfig();
  return {
    auth0Domain: value.auth0Domain || fallback.auth0Domain,
    auth0ClientId: value.auth0ClientId || fallback.auth0ClientId,
    auth0Audience: value.auth0Audience || fallback.auth0Audience,
    auth0CallbackUrl: value.auth0CallbackUrl || fallback.auth0CallbackUrl,
    auth0Namespace: value.auth0Namespace || fallback.auth0Namespace,
    apiBaseUrl: value.apiBaseUrl ?? fallback.apiBaseUrl,
    civicrmUrl: value.civicrmUrl ?? fallback.civicrmUrl,
    devSkipAuth: typeof value.devSkipAuth === 'boolean' ? value.devSkipAuth : fallback.devSkipAuth,
  };
}

export async function loadRuntimeConfig() {
  try {
    const response = await fetch('/api/config', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`GET /api/config failed with ${response.status}`);
    }
    runtimeConfig = coerceConfig(await response.json());
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Using Vite environment fallback config.', error);
    }
    runtimeConfig = fallbackConfig();
  }

  return runtimeConfig;
}

export function setRuntimeConfigForTests(config: Partial<RuntimeConfig>) {
  runtimeConfig = coerceConfig(config);
}

export function getRuntimeConfig() {
  return runtimeConfig;
}

export function getApiBaseUrl() {
  return runtimeConfig.apiBaseUrl;
}

export function getCivicrmUrl() {
  return runtimeConfig.civicrmUrl;
}
