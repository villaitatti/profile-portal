import { useQuery } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';

interface Auth0Role {
  id: string;
  name: string;
  description?: string;
}

export function useRoles() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['auth0-roles'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/roles', { token });
      return res.json() as Promise<Auth0Role[]>;
    },
  });
}
