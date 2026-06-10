import { useCallback } from 'react';
import { toast } from 'sonner';
import { apiFetch, useApiToken } from '@/api/client';

/**
 * Sanitizes a user-facing string into a safe PDF filename stem. Civi contact
 * names can contain spaces, slashes, apostrophes, or non-ASCII characters —
 * all of those collapse to underscores. Preserves ASCII word chars, dots,
 * and hyphens.
 */
function sanitizeFilename(stem: string): string {
  return stem.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
}

export interface DownloadFormPdfArgs {
  invitationId: string;
  pdfKind: 'memorandum' | 'grants-resources';
  pdfLabel: string;
  /** Display name used as the base for the downloaded filename. */
  contactName: string | null;
  /** Form title used alongside contactName in the filename. */
  formTitle: string;
}

/**
 * Downloads the response PDF via the bearer-authenticated admin route.
 *
 *   apiFetch (Bearer header) ─▶ Blob ─▶ object URL ─▶ anchor click ─▶ revoke
 *
 * A plain <a href download> will 401 because the admin API requires a
 * bearer token the browser cannot attach to a direct navigation. On non-2xx
 * a sonner toast surfaces the error — the user retries by re-clicking.
 */
export function useDownloadFormPdf() {
  const getToken = useApiToken();

  return useCallback(
    async ({ invitationId, pdfKind, pdfLabel, contactName, formTitle }: DownloadFormPdfArgs) => {
      let url: string | null = null;
      try {
        const token = await getToken();
        const res = await apiFetch(`/api/admin/forms/response/${invitationId}/pdf/${pdfKind}`, {
          token,
        });
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stem = sanitizeFilename(
          `${contactName ?? `contact_${invitationId.slice(0, 8)}`}_${formTitle}_${pdfLabel}`
        );
        a.download = `${stem || 'form-response'}.pdf`;
        document.body.appendChild(a);
        try {
          a.click();
        } finally {
          // Always detach the anchor, even if click() throws in strict mode
          // or due to a detached parent. Browsers occasionally throw from
          // click() on synthetic anchors.
          document.body.removeChild(a);
        }
      } catch (err) {
        toast.error("Couldn't download the PDF. Try again, or refresh the page if the error repeats.");
        // Re-throw so callers can handle it if they need to (e.g., tests);
        // the toast already communicates the failure to the user.
        throw err;
      } finally {
        // Always revoke the object URL so the blob is eligible for GC even
        // when click() throws or the fetch rejects after the blob was
        // created. Leaking object URLs across a session accumulates memory.
        if (url) URL.revokeObjectURL(url);
      }
    },
    [getToken]
  );
}

// Exported for unit testing; not part of the public hook API.
export const _internal = { sanitizeFilename };
