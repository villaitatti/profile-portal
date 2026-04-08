import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';

// ── Types ──────────────────────────────────────────────────────────

export interface RoleGroupMapping {
  id: string;
  auth0RoleId: string;
  auth0RoleName: string;
  atlassianGroupId: string | null;
  atlassianGroupName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRunSummary {
  id: string;
  status: string;
  triggeredBy: string;
  dryRunId: string | null;
  startedAt: string;
  completedAt: string | null;
  stats: {
    created: number;
    updated: number;
    deactivated: number;
    groupsCreated: number;
    groupsAdded: number;
    groupsRemoved: number;
    errors: number;
    duration_ms: number;
  } | null;
}

export interface SyncRunDetail extends SyncRunSummary {
  diff: {
    usersToCreate: { email: string; name: string }[];
    usersToUpdate: { email: string; changes: Record<string, { from: string; to: string }> }[];
    usersToDeactivate: { email: string; name: string }[];
    groupsToCreate: { name: string; mappedFromRole: string }[];
    membershipChanges: { action: string; userEmail: string; groupName: string; reason: string }[];
  };
  result: {
    operations: {
      seq: number;
      type: string;
      target: string;
      group?: string;
      status: string;
      error?: string;
      description: string;
    }[];
  } | null;
}

export interface SyncProgress {
  phase: string;
  step: number;
  totalSteps: number;
  percentage: number;
  description: string;
  status?: string;
}

export interface SyncStatus {
  configured: boolean;
  devMode: boolean;
}

// ── Hooks ──────────────────────────────────────────────────────────

export function useSyncStatus() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/sync/status', { token });
      return res.json() as Promise<SyncStatus>;
    },
  });
}

export function useMappings() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['sync-mappings'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/sync/mappings', { token });
      return res.json() as Promise<RoleGroupMapping[]>;
    },
  });
}

export function useCreateMapping() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { auth0RoleId: string; auth0RoleName: string; atlassianGroupName: string; atlassianGroupId?: string }) => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/sync/mappings', {
        method: 'POST',
        token,
        body: JSON.stringify(data),
      });
      return res.json() as Promise<RoleGroupMapping>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-mappings'] }),
  });
}

export function useDeleteMapping() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      await apiFetch(`/api/admin/sync/mappings/${id}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-mappings'] }),
  });
}

export function useStartDryRun() {
  const getToken = useApiToken();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/sync/dry-run', { method: 'POST', token });
      return res.json() as Promise<{ runId: string }>;
    },
  });
}

export function useExecuteSync() {
  const getToken = useApiToken();
  return useMutation({
    mutationFn: async (dryRunId: string) => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/sync/execute/${dryRunId}`, { method: 'POST', token });
      return res.json() as Promise<{ runId: string }>;
    },
  });
}

export function useSyncRuns(page = 1) {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['sync-runs', page],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/sync/runs?page=${page}`, { token });
      return res.json() as Promise<{ runs: SyncRunSummary[]; total: number; page: number; perPage: number }>;
    },
  });
}

export function useSyncRunDetail(runId: string | null) {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['sync-run', runId],
    enabled: !!runId,
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch(`/api/admin/sync/runs/${runId}`, { token });
      return res.json() as Promise<SyncRunDetail>;
    },
  });
}

// ── SSE helper ─────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function subscribeSyncProgress(
  runId: string,
  token: string,
  onProgress: (progress: SyncProgress) => void,
  onDone: () => void,
  onError: (err: string) => void
): () => void {
  const url = `${API_BASE}/api/admin/sync/runs/${runId}/stream?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const progress = JSON.parse(event.data) as SyncProgress;
      onProgress(progress);
      if (progress.phase === 'done' || progress.phase === 'error') {
        source.close();
        if (progress.phase === 'error') {
          onError(progress.description);
        } else {
          onDone();
        }
      }
    } catch {
      // ignore parse errors
    }
  };

  source.onerror = () => {
    source.close();
    onError('Connection lost');
  };

  return () => source.close();
}
