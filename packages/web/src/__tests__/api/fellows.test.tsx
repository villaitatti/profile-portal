import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useSendBioEmail,
  useSendVitIdEmail,
  useEmailPreview,
  SendBioEmailError,
  SendVitIdEmailError,
  EmailPreviewError,
} from '@/api/fellows';

// Mock the auth token provider — the hooks call this to attach a Bearer token.
vi.mock('@/api/client', () => ({
  useApiToken: () => async () => 'test-token',
  apiFetch: vi.fn(),
}));

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as any;
  fetchMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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

describe('useSendVitIdEmail', () => {
  it('resolves with the SendBioEmailResponse shape on 200 success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        eventId: 'evt_ok',
        status: 'SENT',
        sentAt: '2026-04-23T12:00:00Z',
      }),
    });

    const { result } = renderHook(() => useSendVitIdEmail(), { wrapper: wrap() });
    await result.current.mutateAsync({ contactId: 1, academicYear: '2026-2027' });

    // Fetched with the right URL and body.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/fellows/1/send-vit-id-email'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ academicYear: '2026-2027' }),
      })
    );
  });

  it('throws SendVitIdEmailError with the parsed reason on 400 {reason}', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ reason: 'already_has_vit_id' }),
    });

    const { result } = renderHook(() => useSendVitIdEmail(), { wrapper: wrap() });
    await expect(
      result.current.mutateAsync({ contactId: 1, academicYear: '2026-2027' })
    ).rejects.toBeInstanceOf(SendVitIdEmailError);

    // Error carries the reason code so UI can map to a specific message.
    try {
      await result.current.mutateAsync({
        contactId: 1,
        academicYear: '2026-2027',
      });
    } catch (err) {
      expect((err as SendVitIdEmailError).reason).toBe('already_has_vit_id');
    }
  });

  it('throws SendVitIdEmailError on 503 civicrm_unavailable (transient upstream)', async () => {
    // The server returns 503 specifically for civicrm_unavailable — the hook
    // still parses the reason out so the modal can show "CiviCRM is
    // temporarily unavailable" instead of a generic 503 message.
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ reason: 'civicrm_unavailable' }),
    });
    const { result } = renderHook(() => useSendVitIdEmail(), { wrapper: wrap() });
    try {
      await result.current.mutateAsync({
        contactId: 1,
        academicYear: '2026-2027',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SendVitIdEmailError);
      expect((err as SendVitIdEmailError).reason).toBe('civicrm_unavailable');
    }
  });

  it('throws a generic Error when the server returns non-ok WITHOUT a reason field', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal_error' }),
    });

    const { result } = renderHook(() => useSendVitIdEmail(), { wrapper: wrap() });
    try {
      await result.current.mutateAsync({
        contactId: 1,
        academicYear: '2026-2027',
      });
      throw new Error('should have thrown');
    } catch (err) {
      // NOT a SendVitIdEmailError — that's reserved for payload.reason paths.
      expect(err).not.toBeInstanceOf(SendVitIdEmailError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('internal_error');
    }
  });

  it('invalidates the fellows React Query cache on success (dashboard refetches)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ eventId: 'evt_ok', status: 'SENT', sentAt: null }),
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useSendVitIdEmail(), {
      wrapper: wrap(qc),
    });
    await result.current.mutateAsync({ contactId: 1, academicYear: '2026-2027' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fellows'] });
  });
});

describe('useSendBioEmail', () => {
  it('throws SendBioEmailError on 502 email_send_failed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ reason: 'email_send_failed' }),
    });

    const { result } = renderHook(() => useSendBioEmail(), { wrapper: wrap() });
    try {
      await result.current.mutateAsync({
        contactId: 1,
        academicYear: '2026-2027',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SendBioEmailError);
      expect((err as SendBioEmailError).reason).toBe('email_send_failed');
    }
  });
});

describe('useEmailPreview', () => {
  it('skips fetching when enabled is false', async () => {
    renderHook(
      () =>
        useEmailPreview({
          contactId: 1,
          type: 'vit_id_invitation',
          academicYear: '2026-2027',
          enabled: false,
        }),
      { wrapper: wrap() }
    );
    // Short delay to let React Query settle. It should not fetch when disabled.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips fetching when contactId is null', async () => {
    renderHook(
      () =>
        useEmailPreview({
          contactId: null,
          type: 'vit_id_invitation',
          academicYear: '2026-2027',
          enabled: true,
        }),
      { wrapper: wrap() }
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips fetching when academicYear is null', async () => {
    renderHook(
      () =>
        useEmailPreview({
          contactId: 1,
          type: 'vit_id_invitation',
          academicYear: null,
          enabled: true,
        }),
      { wrapper: wrap() }
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches with type + academicYear query params and returns the envelope on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        to: 'sofia@example.com',
        bcc: ['angela@itatti.harvard.edu'],
        subject: 'Welcome to I Tatti — Claim your VIT ID',
        body: '<p>Dear Sofia,</p>',
        bodyFormat: 'html',
      }),
    });

    const { result } = renderHook(
      () =>
        useEmailPreview({
          contactId: 1,
          type: 'vit_id_invitation',
          academicYear: '2026-2027',
          enabled: true,
        }),
      { wrapper: wrap() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.subject).toBe(
      'Welcome to I Tatti — Claim your VIT ID'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/admin\/fellows\/1\/email-preview\?type=vit_id_invitation&academicYear=2026-2027/
      ),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      })
    );
  });

  it('throws EmailPreviewError with the parsed reason on 400 {reason}', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ reason: 'missing_first_name' }),
    });

    const { result } = renderHook(
      () =>
        useEmailPreview({
          contactId: 1,
          type: 'vit_id_invitation',
          academicYear: '2026-2027',
          enabled: true,
        }),
      { wrapper: wrap() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(EmailPreviewError);
    expect((result.current.error as EmailPreviewError).reason).toBe(
      'missing_first_name'
    );
  });

  it('does not retry on error (retry: false) — preview errors are surfaced immediately', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ reason: 'missing_first_name' }),
    });

    const { result } = renderHook(
      () =>
        useEmailPreview({
          contactId: 1,
          type: 'vit_id_invitation',
          academicYear: '2026-2027',
          enabled: true,
        }),
      { wrapper: wrap() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    // One call — no retry loop. If this regresses, the modal would show the
    // loading spinner for ~30s while React Query retries 3 times.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
