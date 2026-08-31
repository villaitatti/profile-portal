import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, useApiToken } from './client';
import type {
  FellowsDashboardResponse,
  SendBioEmailReason,
  SendVitIdEmailReason,
  EmailPreviewReason,
} from '@itatti/shared';

export type {
  SendBioEmailReason,
  SendVitIdEmailReason,
  EmailPreviewReason,
} from '@itatti/shared';

export function useFellowsDashboard(academicYear?: string) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['fellows', academicYear],
    queryFn: async () => {
      const token = await getToken();
      const params = academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : '';
      const res = await apiFetch(`/api/admin/fellows${params}`, { token });
      return res.json() as Promise<FellowsDashboardResponse>;
    },
  });
}

export interface SendBioEmailResponse {
  eventId: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  sentAt: string | null;
}

/**
 * Error thrown when the server returns 400/503 { reason } (eligibility
 * failure or transient civicrm outage). Extends Error so React Query /
 * generic error handlers receive a proper Error instance; the `reason`
 * field lets UI code map to a specific toast.
 */
export class SendBioEmailError extends Error {
  readonly reason: SendBioEmailReason;
  constructor(reason: SendBioEmailReason) {
    super(`send-bio-email: ${reason}`);
    this.name = 'SendBioEmailError';
    this.reason = reason;
  }
}

export function useSendBioEmail() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation<
    SendBioEmailResponse,
    Error,
    { contactId: number; academicYear: string; resend?: boolean }
  >({
    mutationFn: async ({ contactId, academicYear, resend }) => {
      const token = await getToken();
      try {
        const res = await apiFetch(`/api/admin/fellows/${contactId}/send-bio-email`, {
          method: 'POST',
          token,
          body: JSON.stringify({ academicYear, ...(resend ? { resend } : {}) }),
        });
        return (await res.json()) as SendBioEmailResponse;
      } catch (err) {
        // 400/503 { reason } is a typed eligibility/outage outcome, distinct
        // from validation 400s and 500s — ApiError carries the parsed body.
        if (err instanceof ApiError && err.reason) {
          throw new SendBioEmailError(err.reason as SendBioEmailReason);
        }
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}

// ────────────────────────────────────────────────────────────────────
// VIT ID invitation: parallel hook family to the bio-email one above.
// Separate error-reason union because the VIT send can fail in ways
// the bio path never can (missing_first_name, already_has_vit_id, etc).
// ────────────────────────────────────────────────────────────────────

export class SendVitIdEmailError extends Error {
  readonly reason: SendVitIdEmailReason;
  constructor(reason: SendVitIdEmailReason) {
    super(`send-vit-id-email: ${reason}`);
    this.name = 'SendVitIdEmailError';
    this.reason = reason;
  }
}

export function useSendVitIdEmail() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation<
    SendBioEmailResponse,
    Error,
    { contactId: number; academicYear: string }
  >({
    mutationFn: async ({ contactId, academicYear }) => {
      const token = await getToken();
      try {
        const res = await apiFetch(`/api/admin/fellows/${contactId}/send-vit-id-email`, {
          method: 'POST',
          token,
          body: JSON.stringify({ academicYear }),
        });
        return (await res.json()) as SendBioEmailResponse;
      } catch (err) {
        if (err instanceof ApiError && err.reason) {
          throw new SendVitIdEmailError(err.reason as SendVitIdEmailReason);
        }
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}

// ────────────────────────────────────────────────────────────────────
// Email preview (shared by both email types). The server renders the
// compiled MJML HTML with substituted variables and returns the envelope
// for display in the EmailPreviewModal.
// ────────────────────────────────────────────────────────────────────

export type EmailPreviewType = 'vit_id_invitation' | 'bio_project_description';

export interface EmailPreviewResponse {
  to: string;
  bcc: string[];
  subject: string;
  body: string;
  bodyFormat: 'html' | 'text';
}

export class EmailPreviewError extends Error {
  readonly reason: EmailPreviewReason;
  constructor(reason: EmailPreviewReason) {
    super(`email-preview: ${reason}`);
    this.name = 'EmailPreviewError';
    this.reason = reason;
  }
}

export function useEmailPreview(args: {
  contactId: number | null;
  type: EmailPreviewType;
  academicYear: string | null;
  enabled: boolean;
}) {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['email-preview', args.type, args.contactId, args.academicYear],
    enabled:
      args.enabled && args.contactId !== null && args.academicYear !== null,
    queryFn: async () => {
      const token = await getToken();
      const qs = new URLSearchParams({
        type: args.type,
        academicYear: args.academicYear as string,
      });
      try {
        const res = await apiFetch(
          `/api/admin/fellows/${args.contactId}/email-preview?${qs.toString()}`,
          { token }
        );
        return (await res.json()) as EmailPreviewResponse;
      } catch (err) {
        if (err instanceof ApiError && err.reason) {
          throw new EmailPreviewError(err.reason as EmailPreviewReason);
        }
        throw err;
      }
    },
    // Previews are cheap to recompute and we want fresh data every time
    // Angela opens the modal. No stale window.
    staleTime: 0,
    retry: false,
  });
}
