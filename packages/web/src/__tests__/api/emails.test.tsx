import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEmailEvents, useEmailEventPreview, useTemplatePreview } from '@/api/emails';

// Mock the auth token provider
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

// ─── useEmailEvents ──────────────────────────────────────────────────────────

describe('useEmailEvents', () => {
  it('fetches events with correct endpoint and returns the events array', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        fellowshipId: 101,
        contactId: 3,
        appointeeName: 'Sophie Laurent',
        academicYear: '2025-2026',
        emailType: 'BIO_PROJECT_DESCRIPTION',
        status: 'SENT',
        enqueuedAt: '2026-04-10T07:00:00.000Z',
        sentAt: '2026-04-11T09:00:00.000Z',
        updatedAt: '2026-04-11T09:00:00.000Z',
        triggeredBy: 'claim_auto',
        failureReason: null,
        sesMessageId: 'ses-123',
      },
    ];

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ events: mockEvents, nextCursor: null }),
    });

    const { result } = renderHook(() => useEmailEvents(), { wrapper: wrap() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ events: mockEvents, nextCursor: null });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/emails'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('throws an error when the response is not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useEmailEvents(), { wrapper: wrap() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toContain('500');
  });
});

// ─── useEmailEventPreview ────────────────────────────────────────────────────

describe('useEmailEventPreview', () => {
  it('skips fetching when eventId is null', async () => {
    renderHook(() => useEmailEventPreview(null), { wrapper: wrap() });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the preview for a specific event and returns the envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        subject: 'Welcome to I Tatti',
        html: '<p>Dear Sofia,</p>',
        text: 'Dear Sofia,',
        bcc: ['angela@itatti.harvard.edu'],
        recipientStatus: 'current',
      }),
    });

    const { result } = renderHook(() => useEmailEventPreview('evt-1'), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      subject: 'Welcome to I Tatti',
      html: '<p>Dear Sofia,</p>',
      text: 'Dear Sofia,',
      bcc: ['angela@itatti.harvard.edu'],
      recipientStatus: 'current',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/emails/evt-1/preview'),
      expect.any(Object)
    );
  });

  it('throws an error with the reason from the response body on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ reason: 'civicrm_unavailable' }),
    });

    const { result } = renderHook(() => useEmailEventPreview('evt-1'), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('civicrm_unavailable');
  });

  it('throws a generic message when response has no reason or error field', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useEmailEventPreview('evt-1'), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Preview failed');
  });

  it('handles json parse failure gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    const { result } = renderHook(() => useEmailEventPreview('evt-1'), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Preview failed');
  });
});

// ─── useTemplatePreview ──────────────────────────────────────────────────────

describe('useTemplatePreview', () => {
  it('skips fetching when type is null', async () => {
    renderHook(() => useTemplatePreview(null), { wrapper: wrap() });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches vit-id-invitation template preview', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        subject: 'Welcome to I Tatti — Claim your VIT ID',
        html: '<p>Dear Sofia,</p>',
        text: 'Dear Sofia,',
        bcc: ['angela@itatti.harvard.edu'],
      }),
    });

    const { result } = renderHook(() => useTemplatePreview('vit-id-invitation'), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.subject).toBe('Welcome to I Tatti — Claim your VIT ID');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/emails/templates/vit-id-invitation/preview'),
      expect.any(Object)
    );
  });

  it('fetches bio-project-description template preview', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        subject: 'Biography and Project Description',
        html: '<p>Dear Marco,</p>',
        text: 'Dear Marco,',
        bcc: [],
      }),
    });

    const { result } = renderHook(
      () => useTemplatePreview('bio-project-description'),
      { wrapper: wrap() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.subject).toBe('Biography and Project Description');
  });

  it('throws on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useTemplatePreview('vit-id-invitation'), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Template preview failed');
  });
});
