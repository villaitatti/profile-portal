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
    expect(result.current.isFetching).toBe(false);
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
    expect(mockApiFetch.mock.calls[0][0]).toContain('q=maria');
  });

  it('fetches for email query (initial mount)', async () => {
    renderHook(() => useVitIdLookup('x@y.com'), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toContain('q=x%40y.com');
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
    expect(mockApiFetch.mock.calls[0][0]).toContain('q=maria');
  });
});

describe('useVitIdLookup — URL encoding', () => {
  it('URL-encodes the query param', async () => {
    renderHook(() => useVitIdLookup('maria rossi'), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toContain('q=maria%20rossi');
  });
});
