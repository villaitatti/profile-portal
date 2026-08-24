import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { validateSseSecret } from './sse-secret.js';

// Short-lived SSE tokens avoid putting the full JWT in query strings.
// Tokens are HMAC-signed and expire after 5 minutes.
//
// SSE_SECRET (base64-encoded, >= 32 bytes) keeps tokens valid across restarts
// and is REQUIRED in production — env.ts refuses to boot without it, so the
// ephemeral fallback below is reachable only in development, where a key that
// dies with the process is harmless. The base64 + length validation lives in
// lib/sse-secret.ts so this loader and the env.ts boot gate share one rule.

function loadSseSecret(): Buffer {
  const envSecret = process.env.SSE_SECRET;
  if (envSecret) {
    const result = validateSseSecret(envSecret);
    if (!result.ok) {
      throw new Error(
        `SSE_SECRET is invalid: ${result.reason}. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
      );
    }
    return Buffer.from(envSecret.trim(), 'base64');
  }
  return randomBytes(32);
}

const SSE_SECRET = loadSseSecret();
const SSE_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createSseToken(userId: string): string {
  const expiresAt = Date.now() + SSE_TOKEN_TTL_MS;
  const payload = `${userId}:${expiresAt}`;
  const sig = createHmac('sha256', SSE_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifySseToken(token: string): { valid: boolean; userId?: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 3) return { valid: false };

    const sig = parts.pop()!;
    const payload = parts.join(':'); // userId may contain colons
    const [userId, expiresAtStr] = [parts.slice(0, -1).join(':'), parts[parts.length - 1]];
    const expiresAt = Number(expiresAtStr);

    if (isNaN(expiresAt) || Date.now() > expiresAt) return { valid: false };

    const expectedSig = createHmac('sha256', SSE_SECRET).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false };
    }

    return { valid: true, userId };
  } catch {
    return { valid: false };
  }
}
