import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddressFormModal } from '@/pages/profile/AddressFormModal';
import type { CiviCRMAddress } from '@itatti/shared';

vi.mock('@/api/contact', () => ({
  useCountries: () => ({
    data: [{ id: 1107, name: 'Italy' }, { id: 1228, name: 'United States' }],
  }),
  useStateProvinces: () => ({ data: [] }),
}));

function renderModal(props: Partial<React.ComponentProps<typeof AddressFormModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const defaultProps: React.ComponentProps<typeof AddressFormModal> = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    address: null,
    isSaving: false,
    usedLocationTypes: [],
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <AddressFormModal {...defaultProps} />
      </QueryClientProvider>
    ),
    props: defaultProps,
  };
}

const primaryAddress: CiviCRMAddress = {
  id: 1,
  contactId: 42,
  streetAddress: 'Via di Vincigliata 26',
  city: 'Florence',
  postalCode: '50135',
  countryId: 1107,
  country: 'Italy',
  locationTypeId: 3,
  locationType: 'Main',
  isPrimary: true,
};

const nonPrimaryAddress: CiviCRMAddress = {
  id: 2,
  contactId: 42,
  streetAddress: '123 Main St',
  city: 'Cambridge',
  postalCode: '02139',
  countryId: 1228,
  country: 'United States',
  locationTypeId: 1,
  locationType: 'Home',
  isPrimary: false,
};

describe('AddressFormModal', () => {
  describe('primary address editing', () => {
    it('hides location type selector and shows static Main label', () => {
      renderModal({ address: primaryAddress });
      expect(screen.getByText(/Type:/)).toBeInTheDocument();
      expect(screen.getByText('Main')).toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /Home/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /Work/i })).not.toBeInTheDocument();
    });

    it('submits without locationTypeId when editing primary address', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderModal({ address: primaryAddress, onSave });

      fireEvent.change(screen.getByDisplayValue('Via di Vincigliata 26'), {
        target: { value: 'Via Nuova 10' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            streetAddress: 'Via Nuova 10',
            city: 'Florence',
            countryId: 1107,
          })
        );
      });

      const payload = onSave.mock.calls[0][0];
      expect(payload.locationTypeId).toBeUndefined();
    });
  });

  describe('non-primary address editing', () => {
    it('shows location type radio buttons', () => {
      renderModal({ address: nonPrimaryAddress });
      expect(screen.getByRole('radio', { name: /Home/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Work/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Temporary/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Other/i })).toBeInTheDocument();
    });

    it('submits with locationTypeId when editing non-primary address', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderModal({ address: nonPrimaryAddress, onSave });

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            streetAddress: '123 Main St',
            city: 'Cambridge',
            countryId: 1228,
            locationTypeId: 1,
          })
        );
      });
    });
  });
});
