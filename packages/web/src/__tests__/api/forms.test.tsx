import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useFormInvitations, useMarkNominationSent } from '@/api/forms';
import { waitFor } from '@testing-library/react';
import { apiFetch } from '@/api/client';

vi.mock('@/api/client', () => ({
  useApiToken: () => async () => 'test-token',
  apiUrl: (path: string) => path,
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

describe('useFormInvitations contract', () => {
  // CRITICAL: pins the /api/admin/forms/invitations response shape between
  // server and client. If either side drifts from { items, facets } the
  // hook stops returning the expected type and this test fires with a
  // clear diff. Changing the server response without updating this fixture
  // (or vice versa) will break the contract at runtime and the user sees
  // a broken submissions page.
  // Deliberately no `token` field on archive rows — design decision to
  // reduce blast radius if a token leaks to a non-admin.
  const contractPayload = {
    items: [
      {
        id: 'inv_1',
        fellowshipId: 10,
        contactId: 100,
        contactName: 'Maria Bianchi',
        academicYear: '2026-2027',
        formType: 'fellow-memorandum',
        formTitle: 'Memorandum I Tatti Fellowship',
        status: 'submitted',
        nominationSentAt: null,
        submittedAt: '2026-04-24T10:00:00.000Z',
        createdAt: '2026-04-20T10:00:00.000Z',
        hasResponse: true,
      },
      {
        id: 'inv_2',
        fellowshipId: 11,
        contactId: 101,
        contactName: null, // CiviCRM-down graceful degrade
        academicYear: '2025-2026',
        formType: 'ancient-survey',
        formTitle: '(retired form: ancient-survey)',
        status: 'submitted',
        nominationSentAt: null,
        submittedAt: '2026-04-18T10:00:00.000Z',
        createdAt: '2026-04-15T10:00:00.000Z',
        hasResponse: true,
      },
    ],
    facets: {
      academicYears: ['2026-2027', '2025-2026'],
      formTypes: ['fellow-memorandum', 'ancient-survey'],
    },
  };

  it('parses the { items, facets } shape the server returns', async () => {
    mockApiFetch.mockResolvedValue({
      json: async () => contractPayload,
    } as Response);

    const { result } = renderHook(() => useFormInvitations({ status: 'submitted' }), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.items[0].contactName).toBe('Maria Bianchi');
    expect(result.current.data?.items[0].formTitle).toBe('Memorandum I Tatti Fellowship');

    // Retired-form + CiviCRM-down row carries a null contactName and the
    // "(retired form:" prefix the UI keys off to disable the PDF button.
    expect(result.current.data?.items[1].contactName).toBeNull();
    expect(result.current.data?.items[1].formTitle.startsWith('(retired form:')).toBe(true);

    // Facets come through unchanged.
    expect(result.current.data?.facets.academicYears).toEqual(['2026-2027', '2025-2026']);
    expect(result.current.data?.facets.formTypes).toEqual(['fellow-memorandum', 'ancient-survey']);
  });

  it('passes query params through to the admin endpoint', async () => {
    mockApiFetch.mockResolvedValue({
      json: async () => ({ items: [], facets: { academicYears: [], formTypes: [] } }),
    } as Response);

    renderHook(
      () =>
        useFormInvitations({
          academicYear: '2026-2027',
          formType: 'fellow-memorandum',
          status: 'submitted',
        }),
      { wrapper: wrap() }
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('academicYear=2026-2027'),
        expect.objectContaining({ token: 'test-token' })
      );
    });

    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toContain('formType=fellow-memorandum');
    expect(path).toContain('status=submitted');
  });
});
