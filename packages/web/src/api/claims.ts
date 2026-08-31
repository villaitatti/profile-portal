import { useInfiniteQuery } from '@tanstack/react-query';
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

interface ClaimsPage {
  claims: VitIdClaim[];
  nextCursor: string | null;
}

// The claim log grows unbounded (one row per successful claim, forever), so
// the endpoint is cursor-paginated and this hook pages through it.
export function useClaims() {
  const getToken = useApiToken();

  return useInfiniteQuery({
    queryKey: ['claims'],
    queryFn: async ({ pageParam }): Promise<ClaimsPage> => {
      const token = await getToken();
      const qs = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : '';
      const res = await apiFetch(`/api/admin/claims${qs}`, { token });
      return res.json() as Promise<ClaimsPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
