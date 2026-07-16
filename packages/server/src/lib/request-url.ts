const SENSITIVE_QUERY_KEYS = new Set(['sse_token', 'token']);

/**
 * Preserve useful route/query context in access logs without persisting bearer
 * credentials embedded in public form paths or query strings.
 */
export function sanitizeRequestUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl, 'http://request.local');
    url.pathname = url.pathname.replace(
      /^\/api\/forms\/[^/]+/,
      '/api/forms/[REDACTED]'
    );
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return '[INVALID_URL]';
  }
}
