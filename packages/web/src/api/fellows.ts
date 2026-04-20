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

export interface SendBioEmailError {
  reason:
    | 'no_vit_id'
    | 'no_matching_fellowship'
    | 'fellowship_not_accepted'
    | 'no_primary_email'
    | 'already_sent';
}

export function useSendBioEmail() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation<
    SendBioEmailResponse,
    Error | SendBioEmailError,
    { contactId: number; academicYear: string }
  >({
    mutationFn: async ({ contactId, academicYear }) => {
      const token = await getToken();
      // Use fetch directly so we can distinguish 400 {reason} from 500 errors;
      // apiFetch throws on any non-2xx and strips the body shape.
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
          throw payload as SendBioEmailError;
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
