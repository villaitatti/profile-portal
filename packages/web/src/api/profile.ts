import { useQuery } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type { UserProfile } from '@itatti/shared';

export function useProfile() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/profile', { token });
      return res.json() as Promise<UserProfile>;
    },
  });
}
