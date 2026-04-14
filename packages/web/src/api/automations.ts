import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';

export interface AutomationRun {
  id: string;
  type: string;
  status: string;
  triggeredBy: string;
  academicYear: string;
  startedAt: string;
  completedAt: string | null;
  result: any;
  stats: any;
}

export interface DryRunResult {
  runId: string;
  type: string;
  academicYear: string;
  actions: { email: string; name: string; action: string }[];
}

export function useAutomationRuns() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['automation-runs'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/automations/runs', { token });
      return res.json() as Promise<AutomationRun[]>;
    },
  });
}

export function useStartDryRun(type: 'end-of-year' | 'new-cohort' | 'backfill') {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/automations/${type}/dry-run`, {
        method: 'POST',
        token,
      });
      return res.json() as Promise<DryRunResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs'] });
    },
  });
}

export function useExecuteAutomation(type: 'end-of-year' | 'new-cohort' | 'backfill') {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string) => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/automations/${type}/execute/${runId}`, {
        method: 'POST',
        token,
      });
      return res.json() as Promise<{ runId: string; status: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs'] });
    },
  });
}
