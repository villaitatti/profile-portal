import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { validateSseSecret } from '../../lib/sse-secret.js';

describe('validateSseSecret', () => {
  it('accepts a real 32-byte base64 key', () => {
    const key = randomBytes(32).toString('base64');
    const result = validateSseSecret(key);
    expect(result).toEqual({ ok: true, bytes: 32 });
  });

  it('accepts a longer key', () => {
    const key = randomBytes(48).toString('base64');
    expect(validateSseSecret(key)).toEqual({ ok: true, bytes: 48 });
  });

  it('rejects a base64 value that decodes to fewer than 32 bytes', () => {
    const key = randomBytes(16).toString('base64');
    const result = validateSseSecret(key);
    expect(result.ok).toBe(false);
  });

  it('rejects a value containing non-base64 characters', () => {
    // The reason this validator exists: Buffer.from(..., "base64") silently
    // drops characters outside the alphabet, so a length-only check would
    // accept this. '$', '@' and spaces are not base64.
    const result = validateSseSecret('not$a@valid base64 secret!!!!!!!!!!!!!!!!!!!!');
    expect(result.ok).toBe(false);
  });

  it('rejects a value whose length is not a multiple of 4', () => {
    // Standard base64 is always padded to a multiple of 4; a truncated paste
    // that lost its padding would otherwise slip through and decode short.
    expect(validateSseSecret('YWJj').ok).toBe(false); // valid but short (3 bytes)
    expect(validateSseSecret('YWJjZ').ok).toBe(false); // length 5, not a multiple of 4
  });

  it('trims surrounding whitespace before validating', () => {
    const key = `  ${randomBytes(32).toString('base64')}  `;
    expect(validateSseSecret(key).ok).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(validateSseSecret('').ok).toBe(false);
  });
});
