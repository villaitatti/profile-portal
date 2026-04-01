import { useQuery } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type { FellowsDashboardResponse } from '@itatti/shared';

export function useFellowsDashboard(academicYear?: string) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['fellows', academicYear],
    queryFn: async () => {
      const token = await getToken();
      const params = academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : '';
      const res = await apiFetch(`/api/admin/fellows${params}`, { token });
      return res.json() as Promise<FellowsDashboardResponse>;
    },
  });
}
