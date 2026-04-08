import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

// Short-lived SSE tokens avoid putting the full JWT in query strings.
// Tokens are HMAC-signed with a server-generated secret and expire after 5 minutes.

const SSE_SECRET = randomBytes(32);
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
