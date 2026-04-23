import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type { FellowsDashboardResponse } from '@itatti/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

export type SendBioEmailReason =
  | 'no_vit_id'
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'already_sent';

/**
 * Error thrown when the server returns 400 { reason } (eligibility failure).
 * Extends Error so React Query / generic error handlers receive a proper
 * Error instance; the `reason` field lets UI code map to a specific toast.
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
    { contactId: number; academicYear: string }
  >({
    mutationFn: async ({ contactId, academicYear }) => {
      const token = await getToken();
      // Use fetch directly so we can distinguish 400 {reason} (eligibility) from
      // 400 {error: 'invalid_request'} (malformed) and 500 errors. apiFetch
      // throws on any non-2xx and strips the body shape.
      const res = await fetch(`${API_BASE}/api/admin/fellows/${contactId}/send-bio-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ academicYear }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (payload && typeof payload.reason === 'string') {
          throw new SendBioEmailError(payload.reason as SendBioEmailReason);
        }
        throw new Error(payload?.error || `Request failed: ${res.status}`);
      }
      return res.json() as Promise<SendBioEmailResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}

// ────────────────────────────────────────────────────────────────────
// VIT ID invitation: parallel hook family to the bio-email one above.
// Separate error-reason union because the VIT send can fail in ways
// the bio path never can (missing_first_name, already_has_vit_id, etc).
// ────────────────────────────────────────────────────────────────────

export type SendVitIdEmailReason =
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'missing_first_name'
  | 'already_has_vit_id'
  | 'needs_review'
  | 'already_sent'
  | 'civicrm_unavailable';

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
      const res = await fetch(
        `${API_BASE}/api/admin/fellows/${contactId}/send-vit-id-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ academicYear }),
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (payload && typeof payload.reason === 'string') {
          throw new SendVitIdEmailError(payload.reason as SendVitIdEmailReason);
        }
        throw new Error(payload?.error || `Request failed: ${res.status}`);
      }
      return res.json() as Promise<SendBioEmailResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fellows'] });
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
  readonly reason: string;
  constructor(reason: string) {
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
      const res = await fetch(
        `${API_BASE}/api/admin/fellows/${args.contactId}/email-preview?${qs.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (payload && typeof payload.reason === 'string') {
          throw new EmailPreviewError(payload.reason);
        }
        throw new Error(payload?.error || `Preview failed: ${res.status}`);
      }
      return res.json() as Promise<EmailPreviewResponse>;
    },
    // Previews are cheap to recompute and we want fresh data every time
    // Angela opens the modal. No stale window.
    staleTime: 0,
    retry: false,
  });
}
