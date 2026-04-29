import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import type {
  CiviCRMAddress,
  CiviCRMPhone,
  CreateAddressInput,
  UpdateAddressInput,
  CreatePhoneInput,
  UpdatePhoneInput,
  CountryOption,
  StateProvinceOption,
} from '@itatti/shared';

// --- Addresses ---

export function useAddresses() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['profile', 'addresses'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/profile/contact/addresses', { token });
      return res.json() as Promise<CiviCRMAddress[]>;
    },
  });
}

export function useCreateAddress() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAddressInput) => {
      const token = await getToken();
      const res = await apiFetch('/api/profile/contact/addresses', {
        method: 'POST',
        body: JSON.stringify(input),
        token,
      });
      return res.json() as Promise<CiviCRMAddress>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
  });
}

export function useUpdateAddress() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateAddressInput & { id: number }) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/addresses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
        token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
  });
}

export function useDeleteAddress() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/addresses/${id}`, {
        method: 'DELETE',
        token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
  });
}

export function useSetPreferredAddress() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/addresses/${id}/preferred`, {
        method: 'PUT',
        token,
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'addresses'] });
      const previous = queryClient.getQueryData<CiviCRMAddress[]>(['profile', 'addresses']);
      queryClient.setQueryData<CiviCRMAddress[]>(['profile', 'addresses'], (old) =>
        old?.map((a) => ({ ...a, isPrimary: a.id === id }))
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'addresses'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
  });
}

// --- Phones ---

export function usePhones() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['profile', 'phones'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/profile/contact/phones', { token });
      return res.json() as Promise<CiviCRMPhone[]>;
    },
  });
}

export function useCreatePhone() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePhoneInput) => {
      const token = await getToken();
      const res = await apiFetch('/api/profile/contact/phones', {
        method: 'POST',
        body: JSON.stringify(input),
        token,
      });
      return res.json() as Promise<CiviCRMPhone>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
  });
}

export function useUpdatePhone() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdatePhoneInput & { id: number }) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/phones/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
        token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
  });
}

export function useDeletePhone() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/phones/${id}`, {
        method: 'DELETE',
        token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
  });
}

export function useSetPreferredPhone() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/phones/${id}/preferred`, {
        method: 'PUT',
        token,
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'phones'] });
      const previous = queryClient.getQueryData<CiviCRMPhone[]>(['profile', 'phones']);
      queryClient.setQueryData<CiviCRMPhone[]>(['profile', 'phones'], (old) =>
        old?.map((p) => ({ ...p, isPrimary: p.id === id }))
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'phones'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
  });
}

// --- Reference data ---

export function useCountries() {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['reference', 'countries'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch('/api/profile/contact/countries', { token });
      return res.json() as Promise<CountryOption[]>;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useStateProvinces(countryId?: number) {
  const getToken = useApiToken();

  return useQuery({
    queryKey: ['reference', 'states', countryId],
    queryFn: async () => {
      const token = await getToken();
      const url = countryId
        ? `/api/profile/contact/states?countryId=${countryId}`
        : '/api/profile/contact/states';
      const res = await apiFetch(url, { token });
      return res.json() as Promise<StateProvinceOption[]>;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!countryId,
  });
}
