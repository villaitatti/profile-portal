import { useQuery } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';

export interface Auth0UserListItem {
  user_id: string;
  email: string;
  name?: string;
  email_verified: boolean;
  last_login?: string;
  created_at: string;
}

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
