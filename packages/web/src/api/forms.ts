import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl, useApiToken } from './client';
import type { FormDef, FormResponseData } from '@itatti/shared';

export interface PublicFormData {
  id: string;
  formType: string;
  status: 'pending' | 'submitted' | 'expired';
  submittedAt: string | null;
  expiresAt: string;
  formDef: FormDef;
}

export class PublicFormRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'PublicFormRequestError';
  }
}

/** One server-side validation failure, flattened for display. */
export interface PublicFormSubmitIssue {
  /** Dotted field path, e.g. `bio` or `familyMembers.0.firstName`. Empty when the issue is form-wide. */
  path: string;
  message: string;
}

export class PublicFormSubmitError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Field-level detail from the server's 400 payload; empty for other failures. */
    public readonly issues: PublicFormSubmitIssue[] = []
  ) {
    super(message);
    this.name = 'PublicFormSubmitError';
  }
}

/**
 * Flattens the zod issue array the server sends as `details` on a 400. Anything
 * unrecognised is dropped rather than rendered raw — the generic banner message
 * still covers it.
 */
function parseSubmitIssues(details: unknown): PublicFormSubmitIssue[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { path, message } = entry as { path?: unknown; message?: unknown };
    if (typeof message !== 'string' || message === '') return [];
    const segments = Array.isArray(path)
      ? path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number')
      : [];
    return [{ path: segments.join('.'), message }];
  });
}

export function usePublicForm(token: string, options?: { refetchOnWindowFocus?: boolean }) {
  return useQuery({
    queryKey: ['public-form', token],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/forms/${token}`), { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new PublicFormRequestError(body.error || 'Failed to load form', res.status);
      }
      return res.json() as Promise<PublicFormData>;
    },
    enabled: !!token,
    // Callers switch this off once a submit succeeded: the server rotates the
    // token on submit, so a focus refetch would 404 over the confirmation.
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
    retry: (failureCount, error) => {
      if (
        error instanceof PublicFormRequestError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });
}

export function useSubmitForm(token: string) {
  return useMutation({
    mutationKey: ['public-form-submit', token],
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(apiUrl(`/api/forms/${token}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new PublicFormSubmitError(
          body.error || 'Submission failed',
          res.status,
          parseSubmitIssues(body.details)
        );
      }
      return res.json();
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
  /** True when the archive cap (1000 rows) was hit — narrow the filters. */
  truncated: boolean;
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
      void queryClient.invalidateQueries({ queryKey: ['form-invitations'] });
      void queryClient.invalidateQueries({ queryKey: ['fellows'] });
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
      void queryClient.invalidateQueries({ queryKey: ['form-invitations'] });
      void queryClient.invalidateQueries({ queryKey: ['fellows'] });
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
      void queryClient.invalidateQueries({ queryKey: ['form-invitations'] });
      void queryClient.invalidateQueries({ queryKey: ['fellows'] });
    },
  });
}
