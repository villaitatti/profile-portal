import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCountries, useStateProvinces } from '@/api/contact';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { LOCATION_TYPES } from '@itatti/shared';
import type { CiviCRMAddress, CreateAddressInput } from '@itatti/shared';

interface AddressFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: CreateAddressInput) => Promise<void>;
  address: CiviCRMAddress | null;
  isSaving: boolean;
  usedLocationTypes: number[];
}

export function AddressFormModal({ open, onClose, onSave, address, isSaving, usedLocationTypes }: AddressFormModalProps) {
  const [streetAddress, setStreetAddress] = useState('');
  const [supplementalAddress1, setSupplementalAddress1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryId, setCountryId] = useState<number | undefined>(undefined);
  const [stateProvinceId, setStateProvinceId] = useState<number | undefined>(undefined);
  const [locationTypeId, setLocationTypeId] = useState<number>(LOCATION_TYPES[0]?.id ?? 1);

  const { data: countries } = useCountries();
  const { data: states } = useStateProvinces(countryId);

  useEffect(() => {
    if (stateProvinceId && states && states.length > 0) {
      const stillValid = states.some((s) => s.id === stateProvinceId);
      if (!stillValid) setStateProvinceId(undefined);
    }
  }, [states, stateProvinceId]);

  useEffect(() => {
    if (open) {
      if (address) {
        setStreetAddress(address.streetAddress || '');
        setSupplementalAddress1(address.supplementalAddress1 || '');
        setCity(address.city || '');
        setPostalCode(address.postalCode || '');
        setCountryId(address.countryId);
        setStateProvinceId(address.stateProvinceId);
        setLocationTypeId(address.locationTypeId || 1);
      } else {
        setStreetAddress('');
        setSupplementalAddress1('');
        setCity('');
        setPostalCode('');
        setCountryId(undefined);
        setStateProvinceId(undefined);
        const firstAvailable = LOCATION_TYPES.find((t) => !usedLocationTypes.includes(t.id));
        setLocationTypeId(firstAvailable?.id ?? LOCATION_TYPES[0]?.id ?? 1);
      }
    }
  }, [open, address, usedLocationTypes]);

  function handleCountryChange(value: string) {
    setCountryId(Number(value));
    setStateProvinceId(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countryId) return;

    await onSave({
      streetAddress,
      supplementalAddress1: supplementalAddress1 || undefined,
      city,
      postalCode: postalCode || undefined,
      stateProvinceId,
      countryId,
      locationTypeId,
    });
  }

  const countryOptions = (countries || []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const stateOptions = (states || []).map((s) => ({
    value: String(s.id),
    label: s.name,
  }));

  const selectedCountry = countries?.find((c) => c.id === countryId);
  const selectedState = states?.find((s) => s.id === stateProvinceId);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(29,37,44,0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-7 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] duration-200 max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
            {address ? 'Edit address' : 'Add address'}
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">
                Type<span className="ml-0.5 text-destructive">*</span>
              </legend>
              <div className="flex flex-wrap gap-3">
                {LOCATION_TYPES.map((type) => {
                  const isDisabled = usedLocationTypes.includes(type.id);
                  return (
                    <label
                      key={type.id}
                      htmlFor={`location-type-${type.id}`}
                      className={`flex items-center gap-2 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <input
                        id={`location-type-${type.id}`}
                        type="radio"
                        name="location-type"
                        value={type.id}
                        checked={locationTypeId === type.id}
                        onChange={() => setLocationTypeId(type.id)}
                        disabled={isDisabled}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className={`text-[0.95rem] ${isDisabled ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {type.label}{isDisabled ? ' (in use)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Field label="Street address" required>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                required
                className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </Field>

            <Field label="Address line 2">
              <input
                type="text"
                value={supplementalAddress1}
                onChange={(e) => setSupplementalAddress1(e.target.value)}
                placeholder="Apt, suite, floor, etc."
                className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="City" required>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </Field>

              <Field label="Postal code">
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </Field>
            </div>

            <Field label="Country" required>
              <SearchableCombobox
                options={countryOptions}
                value={countryId ? String(countryId) : ''}
                displayValue={selectedCountry?.name}
                onSelect={handleCountryChange}
                onClear={() => { setCountryId(undefined); setStateProvinceId(undefined); }}
                placeholder="Select country"
              />
            </Field>

            {countryId && stateOptions.length > 0 && (
              <Field label="State / Province">
                <SearchableCombobox
                  options={stateOptions}
                  value={stateProvinceId ? String(stateProvinceId) : ''}
                  displayValue={selectedState?.name}
                  onSelect={(value) => setStateProvinceId(Number(value))}
                  onClear={() => setStateProvinceId(undefined)}
                  placeholder="Select state/province"
                />
              </Field>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !streetAddress || !city || !countryId}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}
