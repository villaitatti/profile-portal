import { describe, expect, it } from 'vitest';
import { sanitizeRequestUrl } from '../../lib/request-url.js';

describe('sanitizeRequestUrl', () => {
  it('redacts public form bearer tokens while retaining the route shape', () => {
    expect(sanitizeRequestUrl('/api/forms/highly-secret-token')).toBe(
      '/api/forms/[REDACTED]'
    );
  });

  it('redacts sensitive query values and preserves non-sensitive filters', () => {
    expect(
      sanitizeRequestUrl('/api/admin/sync/runs/1/stream?sse_token=secret&view=compact')
    ).toBe('/api/admin/sync/runs/1/stream?sse_token=%5BREDACTED%5D&view=compact');
  });
});
