import { useAuth0 } from '@auth0/auth0-react';
import { auth0Config } from '@/config/auth0';
import { getApiBaseUrl } from '@/config/runtime';

export function apiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const { token, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, body.error || 'Request failed', body.code);
  }

  return response;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Auth0 error codes that mean silent renewal can never succeed — the session is
 * gone, consent was revoked, or there is no refresh token to use. Only a full
 * redirect recovers; retrying the request would just fail again with a generic
 * error banner.
 */
const INTERACTIVE_LOGIN_REQUIRED = new Set([
  'login_required',
  'consent_required',
  'interaction_required',
  'missing_refresh_token',
]);

function needsInteractiveLogin(error: unknown): boolean {
  const code = (error as { error?: unknown } | null)?.error;
  return typeof code === 'string' && INTERACTIVE_LOGIN_REQUIRED.has(code);
}

export function useApiToken() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();

  return async () => {
    try {
      return await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Config.audience,
        },
      });
    } catch (error) {
      if (needsInteractiveLogin(error)) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        await loginWithRedirect({ appState: { returnTo } });
      }
      throw error;
    }
  };
}
