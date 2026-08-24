/**
 * Validation for SSE_SECRET, in its own side-effect-free module so both the
 * boot gate (env.ts) and the runtime loader (sse-token.ts) can share it without
 * env.ts importing sse-token.ts — that would trigger sse-token's top-level key
 * load as a side effect of env validation.
 *
 * `Buffer.from(str, 'base64')` silently DROPS characters outside the base64
 * alphabet rather than rejecting them, so a length-only guard would accept a
 * typo'd or truncated value (e.g. a hex string) as long as enough valid
 * characters survived the decode. Reject the format first, then check length.
 */
export function validateSseSecret(
  value: string
): { ok: true; bytes: number } | { ok: false; reason: string } {
  const trimmed = value.trim();
  // Standard base64 (what `randomBytes(32).toString('base64')` emits): the
  // 64-char alphabet plus up to two '=' padding chars, length a multiple of 4.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    return {
      ok: false,
      reason:
        'not valid base64 (expected standard base64, e.g. from randomBytes(32).toString("base64"))',
    };
  }
  const bytes = Buffer.from(trimmed, 'base64').length;
  if (bytes < 32) {
    return { ok: false, reason: `decodes to ${bytes} bytes, needs at least 32` };
  }
  return { ok: true, bytes };
}
