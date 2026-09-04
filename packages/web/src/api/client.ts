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

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...fetchOptions,
      headers,
    });
  } catch (err) {
    // Users see a translated "server unreachable" message (lib/errors.ts);
    // the technical detail lives here.
    console.error(`[api] ${fetchOptions.method ?? 'GET'} ${path} network failure`, err);
    throw err;
  }

  if (!response.ok) {
    // An empty body (rather than a placeholder `error` string) keeps
    // lib/errors.ts from mistaking a parse failure for a server-authored,
    // user-appropriate message.
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    console.error(
      `[api] ${fetchOptions.method ?? 'GET'} ${path} failed with status ${response.status}`,
      body
    );
    throw new ApiError(
      response.status,
      (typeof body.error === 'string' && body.error) || 'Request failed',
      typeof body.code === 'string' ? body.code : undefined,
      body
    );
  }

  return response;
}

/**
 * Error thrown by apiFetch on any non-2xx response. Carries the FULL parsed
 * error body — earlier versions kept only `error`/`code`, which forced every
 * caller that needed `reason` unions or `details` to bypass apiFetch with a
 * raw fetch and re-implement header/error handling.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /** Full parsed error body (reason unions, validation details, …). */
    public body?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Typed accessor for `{ reason }` domain-outcome bodies. */
  get reason(): string | undefined {
    const r = this.body?.reason;
    return typeof r === 'string' ? r : undefined;
  }

  get details(): unknown {
    return this.body?.details;
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
