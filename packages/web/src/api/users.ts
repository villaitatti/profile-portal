import { useQuery } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type { Auth0UserListItem } from '@itatti/shared';

export type { Auth0UserListItem };

export function useAllUsers(enabled: boolean) {
  const getToken = useApiToken();

  return useQuery<Auth0UserListItem[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/users', { token });
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
