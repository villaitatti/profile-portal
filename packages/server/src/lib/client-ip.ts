import type { Request } from 'express';

/**
 * Resolves the client IP for abuse controls (rate limiting).
 *
 * `X-Forwarded-For` is append-only and client-supplied: any caller can prepend
 * an arbitrary address, and Cloudflare appends rather than replaces. Keying a
 * rate limiter on a value derived from it — which is what express-rate-limit's
 * default `req.ip` generator does under a permissive `trust proxy` — lets an
 * attacker mint a fresh bucket per request and defeat the limit entirely.
 *
 * `CF-Connecting-IP` is written by Cloudflare's edge and overwrites anything the
 * client sent, so it is authoritative *provided all traffic reaches us through
 * the tunnel*. The container must therefore never be published directly to a
 * routable interface; see deploy/docker-compose.yml. When the header is absent
 * (local dev, direct container access) we fall back to the socket-derived
 * `req.ip`, which is not spoofable but also not meaningful behind a proxy.
 */
export function rateLimitKey(req: Request): string {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string') {
    const trimmed = cfConnectingIp.trim();
    if (trimmed.length > 0) return trimmed;
  }

  // Deliberately `req.socket.remoteAddress`, NOT `req.ip`.
  //
  // `req.ip` is derived from X-Forwarded-For under any non-zero `trust proxy`
  // setting, so with a single XFF entry it returns the value the client sent —
  // which is exactly the bypass this module exists to close. Verified against a
  // running server: eight requests carrying eight different XFF values all
  // received their own fresh bucket and none were limited.
  //
  // The socket address cannot be forged over TCP. Behind the tunnel it is
  // constant, so this fallback collapses every caller into one shared bucket:
  // strictly more restrictive than intended, never less. That is the correct
  // direction to fail for an abuse control, and in production the
  // CF-Connecting-IP branch above is what actually runs.
  return req.socket.remoteAddress ?? 'unknown';
}
