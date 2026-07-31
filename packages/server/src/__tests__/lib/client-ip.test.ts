import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { rateLimitKey } from '../../lib/client-ip.js';

/**
 * Builds the minimal Request shape rateLimitKey reads.
 *
 * `ip` is modelled explicitly because that is the trap: Express derives it from
 * X-Forwarded-For whenever `trust proxy` is non-zero, so a key built from it
 * inherits a client-controlled value.
 */
function makeReq(args: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  remoteAddress?: string;
}): Request {
  return {
    headers: args.headers ?? {},
    ip: args.ip,
    socket: { remoteAddress: args.remoteAddress },
  } as unknown as Request;
}

describe('rateLimitKey', () => {
  it('prefers CF-Connecting-IP, which Cloudflare overwrites on every request', () => {
    const key = rateLimitKey(
      makeReq({
        headers: { 'cf-connecting-ip': '203.0.113.7' },
        ip: '10.0.0.1',
        remoteAddress: '172.18.0.5',
      })
    );
    expect(key).toBe('203.0.113.7');
  });

  it('ignores a spoofed X-Forwarded-For entirely', () => {
    // The regression this module exists for: an attacker rotating XFF values
    // minted a fresh rate-limit bucket per request and defeated every public
    // limiter. Two requests with different spoofed values must share a key.
    const a = rateLimitKey(
      makeReq({
        headers: { 'x-forwarded-for': '10.0.0.1' },
        ip: '10.0.0.1',
        remoteAddress: '172.18.0.5',
      })
    );
    const b = rateLimitKey(
      makeReq({
        headers: { 'x-forwarded-for': '10.0.0.2' },
        ip: '10.0.0.2',
        remoteAddress: '172.18.0.5',
      })
    );
    expect(a).toBe(b);
    expect(a).toBe('172.18.0.5');
  });

  it('never returns req.ip, which is XFF-derived under trust proxy', () => {
    const key = rateLimitKey(makeReq({ ip: '10.0.0.99', remoteAddress: '172.18.0.5' }));
    expect(key).not.toBe('10.0.0.99');
    expect(key).toBe('172.18.0.5');
  });

  it('treats a blank or whitespace CF-Connecting-IP as absent', () => {
    expect(rateLimitKey(makeReq({ headers: { 'cf-connecting-ip': '' }, remoteAddress: '1.2.3.4' }))).toBe(
      '1.2.3.4'
    );
    expect(
      rateLimitKey(makeReq({ headers: { 'cf-connecting-ip': '   ' }, remoteAddress: '1.2.3.4' }))
    ).toBe('1.2.3.4');
  });

  it('trims a padded CF-Connecting-IP so padding cannot fork the bucket', () => {
    expect(
      rateLimitKey(makeReq({ headers: { 'cf-connecting-ip': ' 203.0.113.7 ' } }))
    ).toBe('203.0.113.7');
  });

  it('ignores a repeated CF-Connecting-IP header (array-valued) rather than trusting it', () => {
    // Express surfaces duplicated headers as an array. Only the single-string
    // form is authoritative, so fall through to the socket.
    const key = rateLimitKey(
      makeReq({
        headers: { 'cf-connecting-ip': ['203.0.113.7', '198.51.100.1'] },
        remoteAddress: '172.18.0.5',
      })
    );
    expect(key).toBe('172.18.0.5');
  });

  it('falls back to a constant when even the socket address is unavailable', () => {
    // One shared bucket is more restrictive, never less — the safe direction.
    expect(rateLimitKey(makeReq({}))).toBe('unknown');
  });
});
