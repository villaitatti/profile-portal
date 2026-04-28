import { useQuery } from '@tanstack/react-query';
import { useApiToken } from './client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

export function useEmailEvents(params: EmailEventsParams = {}) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['admin-emails', params],
    queryFn: async () => {
      const token = await getToken();
      const url = new URL(`${API_BASE}/api/admin/emails`, window.location.origin);
      if (params.limit) url.searchParams.set('limit', String(params.limit));
      if (params.cursor) url.searchParams.set('cursor', params.cursor);
      if (params.year && params.year !== 'all') url.searchParams.set('year', params.year);
      if (params.type && params.type !== 'all') url.searchParams.set('type', params.type);
      if (params.status) url.searchParams.set('status', params.status);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`Failed to load emails: ${res.status}`);
      return (await res.json()) as EmailEventsResponse;
    },
    staleTime: 60_000,
  });
}

export function useEmailEventPreview(eventId: string | null) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['admin-emails', 'preview', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/admin/emails/${eventId}/preview`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.reason || body.error || `Preview failed: ${res.status}`);
      }
      return (await res.json()) as EmailEventPreview;
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
      const res = await fetch(`${API_BASE}/api/admin/emails/templates/${type}/preview`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`Template preview failed: ${res.status}`);
      return (await res.json()) as TemplatePreview;
    },
    enabled: !!type,
    staleTime: 10 * 60_000,
  });
}
