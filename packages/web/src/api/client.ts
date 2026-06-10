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

export function useApiToken() {
  const { getAccessTokenSilently } = useAuth0();

  return async () => {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: auth0Config.audience,
      },
    });
  };
}
