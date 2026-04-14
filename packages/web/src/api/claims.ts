import { useQuery } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';

export interface VitIdClaim {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  civicrmId: number;
  hasFellowship: boolean;
  hasCurrentFellowship: boolean;
  rolesAssigned: string[];
  orgsAssigned: string[];
  claimedAt: string;
}

export function useClaims() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['claims'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/admin/claims', { token });
      return res.json() as Promise<VitIdClaim[]>;
    },
  });
}
