import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// The hook calls apiFetch + useApiToken. Stub both so the test doesn't need
// Auth0 context.
const { mockApiFetch, mockGetToken } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockGetToken: vi.fn(async () => 'test-token'),
}));

vi.mock('@/api/client', () => ({
  apiFetch: mockApiFetch,
  useApiToken: () => mockGetToken,
}));

import { useVitIdLookup } from '@/api/vit-id-lookup';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockApiFetch.mockReset();
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue('test-token');
  // Default apiFetch response; individual tests override.
  mockApiFetch.mockResolvedValue({
    json: async () => ({ kind: 'name-search', candidates: [] }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useVitIdLookup — enabled gate', () => {
  it('does NOT fetch for empty query', async () => {
    const { result } = renderHook(() => useVitIdLookup(''), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('does NOT fetch for single-character non-email query', async () => {
    renderHook(() => useVitIdLookup('a'), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('fetches for 2+ character name query (initial mount)', async () => {
    // useDebouncedValue initializes state to the current value, so the first
    // fetch fires on mount. The debounce only suppresses subsequent changes.
    renderHook(() => useVitIdLookup('maria'), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    // Query is in the JSON body, not the URL.
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ q: 'maria' });
  });

  it('fetches for email query (initial mount)', async () => {
    renderHook(() => useVitIdLookup('x@y.com'), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ q: 'x@y.com' });
  });
});

describe('useVitIdLookup — debounce behavior', () => {
  it('only fires one fetch when query is typed quickly', async () => {
    const { rerender } = renderHook(({ q }) => useVitIdLookup(q), {
      wrapper: makeWrapper(),
      initialProps: { q: 'm' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ q: 'ma' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ q: 'mar' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ q: 'maria' });
    // Only 300ms has passed since the last change; debounce is 400ms.
    expect(mockApiFetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    // Fetched with the final value, not intermediate ones.
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ q: 'maria' });
  });
});

describe('useVitIdLookup — POST body (no email in URL)', () => {
  it('sends q in the JSON body via POST, not the URL', async () => {
    renderHook(() => useVitIdLookup('maria rossi'), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = mockApiFetch.mock.calls[0];
    // URL carries no query — the email is in the body.
    expect(path).toBe('/api/admin/vit-id-lookup');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ q: 'maria rossi' });
  });
});

describe('useVitIdLookup — debouncedQuery signals freshness', () => {
  it('exposes the debounced query so consumers can suppress stale renders', async () => {
    const { result, rerender } = renderHook(({ q }) => useVitIdLookup(q), {
      wrapper: makeWrapper(),
      initialProps: { q: 'alpha' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(result.current.debouncedQuery).toBe('alpha');

    // User types something new. The debounced value lags by up to 400ms,
    // so for that window debouncedQuery !== current input — consumers use
    // that to hide stale data.
    rerender({ q: 'beta' });
    expect(result.current.debouncedQuery).toBe('alpha');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(result.current.debouncedQuery).toBe('beta');
  });
});
