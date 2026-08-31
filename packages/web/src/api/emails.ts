import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch, useApiToken } from './client';

export interface EmailEvent {
  id: string;
  fellowshipId: number;
  contactId: number;
  appointeeName: string;
  academicYear: string;
  emailType: 'BIO_PROJECT_DESCRIPTION' | 'VIT_ID_INVITATION';
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  enqueuedAt: string;
  sentAt: string | null;
  updatedAt: string;
  triggeredBy: string;
  failureReason: string | null;
  sesMessageId: string | null;
}

export interface EmailEventPreview {
  subject: string;
  html: string;
  text: string;
  bcc: string[];
  recipientStatus: 'current' | 'contact_deleted' | 'no_first_name';
}

export interface TemplatePreview {
  subject: string;
  html: string;
  text: string;
  bcc: string[];
}

export interface EmailEventsParams {
  year?: string;
  type?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface EmailEventsResponse {
  events: EmailEvent[];
  nextCursor: string | null;
}

export function useEmailEvents(params: Omit<EmailEventsParams, 'cursor'> = {}) {
  const getToken = useApiToken();

  // Filters live in the query key, so changing a filter starts a fresh
  // paginated list; the cursor is TanStack's page param, not a filter.
  return useInfiniteQuery({
    queryKey: ['admin-emails', params],
    queryFn: async ({ pageParam }) => {
      const token = await getToken();
      const qs = emailEventsQueryString({ ...params, cursor: pageParam });
      const res = await apiFetch(`/api/admin/emails?${qs}`, { token });
      return (await res.json()) as EmailEventsResponse;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}

export function emailEventsQueryString(params: EmailEventsParams): string {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.year && params.year !== 'all') qs.set('year', params.year);
  if (params.type && params.type !== 'all') qs.set('type', params.type);
  if (params.status) qs.set('status', params.status);
  return qs.toString();
}

export function useEmailEventPreview(eventId: string | null) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['admin-emails', 'preview', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const token = await getToken();
      try {
        const res = await apiFetch(`/api/admin/emails/${eventId}/preview`, { token });
        return (await res.json()) as EmailEventPreview;
      } catch (err) {
        // The 503 body is { reason: 'civicrm_unavailable' } — surface the
        // reason as the message the page renders, as before.
        if (err instanceof ApiError && err.reason) throw new Error(err.reason);
        throw err;
      }
    },
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });
}

export function useTemplatePreview(type: 'vit-id-invitation' | 'bio-project-description' | null) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['admin-emails', 'template', type],
    queryFn: async () => {
      if (!type) return null;
      const token = await getToken();
      const res = await apiFetch(`/api/admin/emails/templates/${type}/preview`, { token });
      return (await res.json()) as TemplatePreview;
    },
    enabled: !!type,
    staleTime: 10 * 60_000,
  });
}
