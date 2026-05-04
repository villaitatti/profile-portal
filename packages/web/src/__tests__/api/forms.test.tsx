import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMarkNominationSent } from '@/api/forms';
import { apiFetch } from '@/api/client';

vi.mock('@/api/client', () => ({
  useApiToken: () => async () => 'test-token',
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

function wrap(client?: QueryClient) {
  const qc =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useMarkNominationSent', () => {
  it('posts the selected nomination date and refreshes form and fellow data', async () => {
    mockApiFetch.mockResolvedValue({
      json: async () => ({
        id: 'inv_1',
        nominationSentAt: '2026-05-04T12:00:00.000Z',
      }),
    } as Response);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useMarkNominationSent(), {
      wrapper: wrap(qc),
    });

    await result.current.mutateAsync({
      invitationId: 'inv_1',
      nominationSentOn: '2026-05-04',
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/admin/forms/nomination-sent/inv_1',
      expect.objectContaining({
        token: 'test-token',
        method: 'POST',
        body: JSON.stringify({ nominationSentOn: '2026-05-04' }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['form-invitations'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fellows'] });
  });
});
