import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type { Application, CreateApplicationInput, UpdateApplicationInput } from '@itatti/shared';

export function useApplications() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/applications', { token });
      return res.json() as Promise<Application[]>;
    },
  });
}

export function useApplication(id: number) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['applications', id],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch(`/api/applications/${id}`, { token });
      return res.json() as Promise<Application>;
    },
    enabled: id > 0,
  });
}

export function useCreateApplication() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApplicationInput) => {
      const token = await getToken();
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        body: JSON.stringify(input),
        token,
      });
      return res.json() as Promise<Application>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useUpdateApplication() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateApplicationInput & { id: number }) => {
      const token = await getToken();
      const res = await apiFetch(`/api/applications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
        token,
      });
      return res.json() as Promise<Application>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useDeleteApplication() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await apiFetch(`/api/applications/${id}`, {
        method: 'DELETE',
        token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}
