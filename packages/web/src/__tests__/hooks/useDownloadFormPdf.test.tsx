import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDownloadFormPdf, _internal } from '@/hooks/useDownloadFormPdf';
import { apiFetch, ApiError } from '@/api/client';
import { toast } from 'sonner';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    useApiToken: () => async () => 'test-token',
    apiFetch: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockToastError = vi.mocked(toast.error);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('sanitizeFilename', () => {
  it('replaces spaces with underscores', () => {
    expect(_internal.sanitizeFilename('Maria Bianchi Fellow Memo')).toBe('Maria_Bianchi_Fellow_Memo');
  });

  it('replaces slashes, apostrophes, accents with underscores', () => {
    expect(_internal.sanitizeFilename("O'Connell Martínez / 2026")).toBe('O_Connell_Mart_nez_2026');
  });

  it('preserves dots and hyphens', () => {
    expect(_internal.sanitizeFilename('Dr.Smith-2026.doc')).toBe('Dr.Smith-2026.doc');
  });

  it('trims leading and trailing underscores from collapsing sanitization', () => {
    expect(_internal.sanitizeFilename('   weird!!   ')).toBe('weird');
  });
});

describe('useDownloadFormPdf', () => {
  // The hook creates an <a>, sets .download, appends to body, clicks, then
  // removes. We capture the anchor by watching appendChild on document.body
  // and stub the anchor's click() via a prototype spy so no navigation
  // happens in jsdom. URL.createObjectURL / revokeObjectURL get simple
  // stub implementations.

  let clickSpy: ReturnType<typeof vi.spyOn>;
  let appendedAnchors: HTMLAnchorElement[];
  let origAppendChild: typeof document.body.appendChild;

  beforeEach(() => {
    // Fake timers: the hook defers URL.revokeObjectURL past the click.
    vi.useFakeTimers();
    appendedAnchors = [];
    origAppendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
      if (node instanceof HTMLAnchorElement) appendedAnchors.push(node);
      return origAppendChild(node);
    });
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls the bearer-authenticated PDF endpoint and triggers a download', async () => {
    const fakeBlob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    mockApiFetch.mockResolvedValue({
      blob: async () => fakeBlob,
    } as unknown as Response);

    const { result } = renderHook(() => useDownloadFormPdf());

    await act(async () => {
      await result.current({
        invitationId: 'inv_abc12345',
        pdfKind: 'memorandum',
        pdfLabel: 'Memorandum',
        contactName: 'Maria Bianchi',
        formTitle: 'Memorandum I Tatti Fellowship',
      });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/admin/forms/response/inv_abc12345/pdf/memorandum',
      { token: 'test-token' }
    );
    expect(clickSpy).toHaveBeenCalledOnce();
    // The revoke is deferred so the browser can finish reading the blob;
    // revoking in the same task has historically aborted large downloads.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(appendedAnchors).toHaveLength(1);
    expect(appendedAnchors[0].download).toBe(
      'Maria_Bianchi_Memorandum_I_Tatti_Fellowship_Memorandum.pdf'
    );
  });

  it('falls back to a contact-id stem when contactName is null (CiviCRM-down path)', async () => {
    const fakeBlob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    mockApiFetch.mockResolvedValue({ blob: async () => fakeBlob } as unknown as Response);

    const { result } = renderHook(() => useDownloadFormPdf());

    await act(async () => {
      await result.current({
        invitationId: 'inv_abc12345',
        pdfKind: 'grants-resources',
        pdfLabel: 'Grant Information',
        contactName: null,
        formTitle: 'Memo',
      });
    });

    expect(appendedAnchors[0].download).toBe('contact_inv_abc1_Memo_Grant_Information.pdf');
  });

  it('surfaces a sonner toast on non-2xx API responses', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(401, 'unauthorized'));

    const { result } = renderHook(() => useDownloadFormPdf());

    await expect(
      act(async () => {
        await result.current({
          invitationId: 'inv_1',
          pdfKind: 'memorandum',
          pdfLabel: 'Memorandum',
          contactName: 'Test',
          formTitle: 'Form',
        });
      })
    ).rejects.toBeInstanceOf(ApiError);

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't download the PDF")
    );
    // No anchor appended on failure path.
    expect(appendedAnchors).toHaveLength(0);
  });
});
