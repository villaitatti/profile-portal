import { describe, it, expect } from 'vitest';
import { queryClient } from '@/config/query-client';

type RetryFn = (failureCount: number, error: unknown) => boolean;

const retry = queryClient.getDefaultOptions().queries?.retry as RetryFn;

class FakeApiError extends Error {
  constructor(public status: number) {
    super(`status ${status}`);
  }
}

describe('queryClient default retry policy', () => {
  it.each([400, 401, 403, 404, 409, 429])('does not retry HTTP %s', (status) => {
    expect(retry(0, new FakeApiError(status))).toBe(false);
  });

  it.each([500, 502, 503])('retries HTTP %s once', (status) => {
    expect(retry(0, new FakeApiError(status))).toBe(true);
    expect(retry(1, new FakeApiError(status))).toBe(false);
  });

  it('retries errors without a status (network failures) once', () => {
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(false);
  });
});
