import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  PublicFormSubmitError,
  useFormInvitations,
  useMarkNominationSent,
  usePublicForm,
  useSubmitForm,
} from '@/api/forms';
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

describe('usePublicForm', () => {
  it('does not retry a missing or expired bearer link', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 }));
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: 3, retryDelay: 0 } },
    });

    const { result } = renderHook(() => usePublicForm('missing-token'), {
      wrapper: wrap(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient server failures before succeeding', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'inv_1',
            formType: 'fellow-memorandum',
            status: 'pending',
            submittedAt: null,
            expiresAt: '2026-10-24T10:00:00.000Z',
            formDef: { id: 'fellow-memorandum', title: 'Form', appointmentTypes: [], sections: [] },
          }),
          { status: 200 }
        )
      );
    const qc = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });

    const { result } = renderHook(() => usePublicForm('temporary-failure'), {
      wrapper: wrap(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 4000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('useSubmitForm', () => {
  it('carries the server field detail off a 400 so the UI can render it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Validation failed',
          details: [
            { code: 'too_big', path: ['bio'], message: 'String must contain at most 5000 character(s)' },
            { code: 'custom', path: [], message: 'Payload too large' },
            { code: 'unparseable' },
          ],
        }),
        { status: 400 }
      )
    );

    const { result } = renderHook(() => useSubmitForm('tok'), { wrapper: wrap() });

    await act(async () => {
      await result.current.mutateAsync({ bio: 'x'.repeat(6000) }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const error = result.current.error as PublicFormSubmitError;
    expect(error).toBeInstanceOf(PublicFormSubmitError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed');
    // Issues without a usable message are dropped rather than rendered raw.
    expect(error.issues).toEqual([
      { path: 'bio', message: 'String must contain at most 5000 character(s)' },
      { path: '', message: 'Payload too large' },
    ]);
  });

  it('resets successful mutation state when navigating to a different token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ invitationId: 'inv_1', responseId: 'r_1' }), { status: 201 })
    );
    const { result, rerender } = renderHook(({ token }) => useSubmitForm(token), {
      initialProps: { token: 'token-a' },
      wrapper: wrap(),
    });

    await act(async () => {
      await result.current.mutateAsync({ fullName: 'Maria' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ token: 'token-b' });
    await waitFor(() => expect(result.current.isSuccess).toBe(false));
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
