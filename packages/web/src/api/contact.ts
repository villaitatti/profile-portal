import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useApiToken } from './client';
import { toast } from 'sonner';
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'addresses'] });
      const previous = queryClient.getQueryData<CiviCRMAddress[]>(['profile', 'addresses']);
      const optimistic: CiviCRMAddress = {
        id: -Date.now(),
        contactId: 0,
        streetAddress: input.streetAddress,
        supplementalAddress1: input.supplementalAddress1,
        city: input.city,
        postalCode: input.postalCode,
        stateProvinceId: input.stateProvinceId,
        countryId: input.countryId,
        locationTypeId: input.locationTypeId || 1,
        locationType: 'Home',
        isPrimary: !previous || previous.length === 0,
      };
      queryClient.setQueryData<CiviCRMAddress[]>(['profile', 'addresses'], (old) =>
        [...(old || []), optimistic]
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Address added');
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'addresses'], context.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to save address.');
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
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'addresses'] });
      const previous = queryClient.getQueryData<CiviCRMAddress[]>(['profile', 'addresses']);
      queryClient.setQueryData<CiviCRMAddress[]>(['profile', 'addresses'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, ...input } : a))
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Address updated');
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'addresses'], context.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update address.');
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'addresses'] });
      const previous = queryClient.getQueryData<CiviCRMAddress[]>(['profile', 'addresses']);
      queryClient.setQueryData<CiviCRMAddress[]>(['profile', 'addresses'], (old) =>
        old?.filter((a) => a.id !== id)
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Address deleted');
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'addresses'], context.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to delete address.');
    },
  });
}

export interface SetPreferredAddressResponse {
  success: boolean;
  oldPrimaryId: number | null;
  oldPrimaryLocationType: string | null;
}

export function useSetPreferredAddress() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      const res = await apiFetch(`/api/profile/contact/addresses/${id}/preferred`, {
        method: 'PUT',
        token,
      });
      return res.json() as Promise<SetPreferredAddressResponse>;
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
      toast.error('Failed to set preferred address.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
  });
}

export function useReclassifyAddress() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, locationTypeId }: { id: number; locationTypeId: number }) => {
      const token = await getToken();
      await apiFetch(`/api/profile/contact/addresses/${id}/reclassify`, {
        method: 'PUT',
        body: JSON.stringify({ locationTypeId }),
        token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] });
    },
    onError: () => {
      toast.warning('Preferred updated, but could not update the previous address type. You can edit it manually.');
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'phones'] });
      const previous = queryClient.getQueryData<CiviCRMPhone[]>(['profile', 'phones']);
      const optimistic: CiviCRMPhone = {
        id: -Date.now(),
        contactId: 0,
        phone: input.phone,
        phoneTypeId: input.phoneTypeId,
        phoneType: input.phoneTypeId === 2 ? 'Mobile' : 'Phone',
        isPrimary: !previous || previous.length === 0,
      };
      queryClient.setQueryData<CiviCRMPhone[]>(['profile', 'phones'], (old) =>
        [...(old || []), optimistic]
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Phone number added');
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'phones'], context.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to save phone number.');
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
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'phones'] });
      const previous = queryClient.getQueryData<CiviCRMPhone[]>(['profile', 'phones']);
      queryClient.setQueryData<CiviCRMPhone[]>(['profile', 'phones'], (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...input, phoneType: (input.phoneTypeId === 2 ? 'Mobile' : input.phoneTypeId === 1 ? 'Phone' : p.phoneType) as 'Phone' | 'Mobile' } : p))
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Phone number updated');
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'phones'], context.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update phone number.');
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['profile', 'phones'] });
      const previous = queryClient.getQueryData<CiviCRMPhone[]>(['profile', 'phones']);
      queryClient.setQueryData<CiviCRMPhone[]>(['profile', 'phones'], (old) =>
        old?.filter((p) => p.id !== id)
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Phone number deleted');
      queryClient.invalidateQueries({ queryKey: ['profile', 'phones'] });
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'phones'], context.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to delete phone number.');
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
    onSuccess: () => {
      toast.success('Primary number updated');
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profile', 'phones'], context.previous);
      }
      toast.error('Failed to set preferred phone number.');
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
