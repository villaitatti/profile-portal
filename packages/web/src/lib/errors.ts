import type { TFunction } from 'i18next';

/**
 * One consistent way to turn an unknown thrown value into a string that is
 * safe to put on screen.
 *
 * Raw `err.message` used to be rendered directly, which leaked technical,
 * English-only text ("Failed to fetch", "Internal Server Error", "jwt
 * expired") to users. The rule here:
 *
 * - 4xx API bodies are authored for end users on the server (e.g. "You
 *   already have a Home address for this year") and pass through — except
 *   401/403, whose messages come from auth middleware and get a translated
 *   session/permission message instead.
 * - Everything else (5xx, network failures, unexpected exceptions) maps to a
 *   translated generic message; the technical detail is logged by the API
 *   layer (see `apiFetch`), not shown.
 *
 * `fallback` lets a call site keep its more specific translated copy (e.g.
 * "The address could not be saved.") for the generic branches.
 *
 * ApiError is detected by shape, not `instanceof`: importing `@/api/client`
 * would pull the Auth0 SDK into every chunk that loads this module (see the
 * same constraint in src/config/query-client.ts).
 */
export function userErrorMessage(err: unknown, t: TFunction, fallback?: string): string {
  const status = httpStatusOf(err);
  if (status !== undefined) {
    if (status === 401) return t('common.errors.sessionExpired');
    if (status === 403) return t('common.errors.notAllowed');
    if (status < 500) {
      return serverMessageOf(err) ?? fallback ?? t('common.errors.unexpected');
    }
    return fallback ?? t('common.errors.server');
  }
  // fetch() rejects with a TypeError when the server is unreachable.
  if (err instanceof TypeError) return t('common.errors.network');
  return fallback ?? t('common.errors.unexpected');
}

/** Reads the HTTP status off an ApiError-shaped value, if there is one. */
export function httpStatusOf(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * The server-authored error body text, if the response actually carried one.
 * `ApiError.message` is unreliable here: it falls back to a hardcoded
 * placeholder when the body had no `error` field, so read the body directly.
 */
function serverMessageOf(err: unknown): string | undefined {
  const body = (err as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as Record<string, unknown>).error;
  return typeof message === 'string' && message.trim() !== '' ? message : undefined;
}
