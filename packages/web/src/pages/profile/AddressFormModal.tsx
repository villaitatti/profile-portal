import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
  const { t } = useTranslation();
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
      locationTypeId: address?.isPrimary ? undefined : locationTypeId,
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="block max-h-[90vh] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-xl border bg-card p-7 sm:max-w-lg"
      >
          <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
            {address ? t('profile.addressForm.editTitle') : t('profile.addressForm.addTitle')}
          </DialogTitle>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {address?.isPrimary ? (
              <p className="text-[0.88rem] text-muted-foreground">
                {t('profile.addressForm.typeLabel')}:{' '}
                <span className="font-medium text-foreground">
                  {t('profile.addresses.locationTypes.Main')}
                </span>{' '}
                {t('profile.addressForm.primaryNote')}
              </p>
            ) : (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">
                {t('profile.addressForm.typeLabel')}<span className="ml-0.5 text-destructive">*</span>
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
                        {t(`profile.addresses.locationTypes.${type.label}`, { defaultValue: type.label })}
                        {isDisabled ? ` ${t('profile.addressForm.inUse')}` : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            )}

            <Field label={t('profile.addressForm.street')} required>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                required
                className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </Field>

            <Field label={t('profile.addressForm.line2')}>
              <input
                type="text"
                value={supplementalAddress1}
                onChange={(e) => setSupplementalAddress1(e.target.value)}
                placeholder={t('profile.addressForm.line2Placeholder')}
                className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('profile.addressForm.city')} required>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </Field>

              <Field label={t('profile.addressForm.postalCode')}>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </Field>
            </div>

            <Field label={t('profile.addressForm.country')} required>
              <SearchableCombobox
                options={countryOptions}
                value={countryId ? String(countryId) : ''}
                displayValue={selectedCountry?.name}
                onSelect={handleCountryChange}
                onClear={() => { setCountryId(undefined); setStateProvinceId(undefined); }}
                placeholder={t('profile.addressForm.countryPlaceholder')}
              />
            </Field>

            {countryId && stateOptions.length > 0 && (
              <Field label={t('profile.addressForm.stateProvince')}>
                <SearchableCombobox
                  options={stateOptions}
                  value={stateProvinceId ? String(stateProvinceId) : ''}
                  displayValue={selectedState?.name}
                  onSelect={(value) => setStateProvinceId(Number(value))}
                  onClear={() => setStateProvinceId(undefined)}
                  placeholder={t('profile.addressForm.statePlaceholder')}
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
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving || !streetAddress || !city || !countryId}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? t('profile.saving') : t('common.save')}
              </button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
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
