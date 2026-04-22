import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, useApiToken } from './client';
import type { VitIdLookupResponse } from '@itatti/shared';

/**
 * Debounced hook for the unified "Has VIT ID?" search. The query fires
 * 400ms after the user stops typing, which is gentle on CiviCRM/Auth0 when
 * the staff member is still deciding what to type.
 *
 * `enabled` false until `query` is non-empty and either looks like an email
 * (contains '@') OR has at least 2 characters. Short single-char queries
 * trigger a lot of noise on the Auth0 name-substring path.
 */
export function useVitIdLookup(query: string) {
  const getToken = useApiToken();
  const debounced = useDebouncedValue(query.trim(), 400);

  const enabled = debounced.length > 0 && (debounced.includes('@') || debounced.length >= 2);

  return useQuery<VitIdLookupResponse>({
    queryKey: ['vit-id-lookup', debounced],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch(
        `/api/admin/vit-id-lookup?q=${encodeURIComponent(debounced)}`,
        { token }
      );
      return res.json();
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
