import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type { FormDef, FormResponseData } from '@itatti/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface PublicFormData {
  id: string;
  formType: string;
  status: 'pending' | 'submitted' | 'expired';
  submittedAt: string | null;
  formDef: FormDef;
  response: FormResponseData | null;
}

export function usePublicForm(token: string) {
  return useQuery({
    queryKey: ['public-form', token],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/forms/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || 'Failed to load form');
      }
      return res.json() as Promise<PublicFormData>;
    },
    enabled: !!token,
  });
}

export function useSubmitForm(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`${API_BASE}/api/forms/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || 'Submission failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-form', token] });
    },
  });
}

export interface AdminFormInvitation {
  id: string;
  fellowshipId: number;
  contactId: number;
  /**
   * Resolved appointee name (first + last). Null when CiviCRM is unreachable
   * or the contact is not in the fellows roster — UI should fall back to
   * rendering `Contact #${contactId}`.
   */
  contactName: string | null;
  academicYear: string;
  formType: string;
  /**
   * Registered form title. For a retired `formType` not in FORM_REGISTRY,
   * this is `"(retired form: <formType>)"` and the PDF download should be
   * disabled (PDF generation requires the form definition).
   */
  formTitle: string;
  status: string;
  nominationSentAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  hasResponse: boolean;
}

export interface AdminFormInvitationsResponse {
  items: AdminFormInvitation[];
  facets: {
    /** All distinct academic years across submitted invitations, newest first. */
    academicYears: string[];
    /** All distinct form types across submitted invitations, alpha sorted. */
    formTypes: string[];
  };
}

export function useFormRegistry() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['form-registry'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/forms/registry', { token });
      return res.json() as Promise<FormDef[]>;
    },
  });
}

export function useFormInvitations(filters?: { academicYear?: string; formType?: string; status?: string }) {
  const getToken = useApiToken();
  const params = new URLSearchParams();
  if (filters?.academicYear) params.set('academicYear', filters.academicYear);
  if (filters?.formType) params.set('formType', filters.formType);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['form-invitations', filters],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/forms/invitations${qs}`, { token });
      return res.json() as Promise<AdminFormInvitationsResponse>;
    },
  });
}

export function useGenerateFormInvitation() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      fellowshipId: number;
      contactId: number;
      academicYear: string;
      formType: string;
    }) => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/forms/generate', {
        token,
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json() as Promise<{ id: string; token: string; created: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}

export function useMarkNominationSent() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { invitationId: string; nominationSentOn: string }) => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/forms/nomination-sent/${data.invitationId}`, {
        token,
        method: 'POST',
        body: JSON.stringify({ nominationSentOn: data.nominationSentOn }),
      });
      return res.json() as Promise<{ id: string; nominationSentAt: string | null }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}

export function useFormResponse(invitationId: string | null) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['form-response', invitationId],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/forms/response/${invitationId}`, { token });
      return res.json() as Promise<{ id: string; data: FormResponseData; createdAt: string }>;
    },
    enabled: !!invitationId,
  });
}

export function useResetFormInvitation() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/forms/reset', {
        token,
        method: 'POST',
        body: JSON.stringify({ invitationId }),
      });
      return res.json() as Promise<{ token: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}

