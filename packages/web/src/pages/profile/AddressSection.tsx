import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Pencil, Trash2, RefreshCw, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useAddresses,
  useCreateAddress,
  useUpdateAddress,
  useDeleteAddress,
  useSetPreferredAddress,
  useReclassifyAddress,
} from '@/api/contact';
import { AddressFormModal } from './AddressFormModal';
import { LOCATION_TYPES, LOCATION_TYPE_MAIN_ID } from '@itatti/shared';
import type { CiviCRMAddress, CreateAddressInput, UpdateAddressInput } from '@itatti/shared';

export function AddressSection() {
  const { t } = useTranslation();
  const { data: addresses, isLoading, error, refetch } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const setPreferred = useSetPreferredAddress();
  const reclassify = useReclassifyAddress();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CiviCRMAddress | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reclassifyTarget, setReclassifyTarget] = useState<{ id: number; currentType: string; freedTypeId?: number } | null>(null);

  const usedLocationTypes = useMemo(() => {
    if (!addresses) return [];
    return addresses
      .filter((a) => a.locationTypeId !== LOCATION_TYPE_MAIN_ID)
      .map((a) => a.locationTypeId);
  }, [addresses]);

  const allTypesUsed = useMemo(() => {
    return LOCATION_TYPES.every((t) => usedLocationTypes.includes(t.id));
  }, [usedLocationTypes]);

  const modalUsedTypes = useMemo(() => {
    if (!editingAddress) return usedLocationTypes;
    return usedLocationTypes.filter((t) => t !== editingAddress.locationTypeId);
  }, [usedLocationTypes, editingAddress]);

  function handleAdd() {
    setEditingAddress(null);
    setModalOpen(true);
  }

  function handleEdit(address: CiviCRMAddress) {
    setEditingAddress(address);
    setModalOpen(true);
  }

  async function handleSave(input: CreateAddressInput) {
    try {
      if (editingAddress) {
        const updateInput: UpdateAddressInput & { id: number } = { id: editingAddress.id, ...input };
        await updateAddress.mutateAsync(updateInput);
      } else {
        await createAddress.mutateAsync(input);
      }
      setModalOpen(false);
      setEditingAddress(null);
    } catch { /* handled by mutation onError */ }
  }

  async function handleDelete() {
    if (deletingId !== null) {
      try {
        await deleteAddress.mutateAsync(deletingId);
        setDeletingId(null);
      } catch { /* handled by mutation onError */ }
    }
  }

  async function handlePreferred(id: number) {
    try {
      const newPrimary = addresses?.find((a) => a.id === id);
      const result = await setPreferred.mutateAsync(id);
      if (result.oldPrimaryId) {
        setReclassifyTarget({
          id: result.oldPrimaryId,
          currentType: result.oldPrimaryLocationType || 'Main',
          freedTypeId: newPrimary?.locationTypeId,
        });
      }
    } catch { /* handled by mutation onError */ }
  }

  function handleReclassify(locationTypeId: number) {
    if (reclassifyTarget) {
      reclassify.mutate({ id: reclassifyTarget.id, locationTypeId });
      setReclassifyTarget(null);
    }
  }

  function handleReclassifyDismiss() {
    if (reclassifyTarget) {
      const effectiveUsed = reclassifyTarget.freedTypeId
        ? usedLocationTypes.filter((t) => t !== reclassifyTarget.freedTypeId)
        : usedLocationTypes;
      const availableTypes = LOCATION_TYPES.filter((t) => !effectiveUsed.includes(t.id));
      const defaultType = availableTypes[0]?.id ?? 1;
      reclassify.mutate({ id: reclassifyTarget.id, locationTypeId: defaultType });
      setReclassifyTarget(null);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 md:px-8 motion-safe:animate-pulse">
        <SkeletonBlock className="h-5 w-40 rounded-full" />
        <SkeletonBlock className="mt-4 h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-6 md:px-8">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">{t('profile.addresses.title')}</h2>
        </div>
        <p className="mt-4 text-[0.95rem] text-muted-foreground">
          {t('profile.addresses.loadError')}
        </p>
        <button
          onClick={() => void refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6 md:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">{t('profile.addresses.title')}</h2>
        </div>
        {!allTypesUsed && (
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('profile.addresses.add')}
          </button>
        )}
      </div>

      <p className="mt-2 text-[0.88rem] leading-6 text-muted-foreground">
        <Star className="inline h-3.5 w-3.5 fill-crimson-mark text-crimson-mark -mt-0.5" /> {t('profile.addresses.primaryHint')}
      </p>

      {addresses && addresses.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-center">
          <p className="text-[0.95rem] text-muted-foreground">
            {t('profile.addresses.empty')}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {addresses?.map((address) => (
            <div
              key={address.id}
              className="rounded-lg border p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-[0.95rem] leading-6 text-foreground">
                  <p>{address.streetAddress}</p>
                  {address.supplementalAddress1 && <p>{address.supplementalAddress1}</p>}
                  <p>
                    {[address.postalCode, address.city, address.stateProvince]
                      .filter(Boolean)
                      .join(', ')}
                    {address.country && `, ${address.country}`}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.78rem] font-medium text-muted-foreground">
                  {address.locationType
                    ? t(`profile.addresses.locationTypes.${address.locationType}`, { defaultValue: address.locationType })
                    : address.locationType}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="preferred-address"
                    checked={address.isPrimary}
                    onChange={() => void handlePreferred(address.id)}
                    className="h-4 w-4 text-crimson accent-crimson"
                  />
                  <span className={`flex items-center gap-1 ${address.isPrimary ? 'font-medium text-crimson' : 'text-muted-foreground'}`}>
                    {address.isPrimary && <Star className="h-3.5 w-3.5 fill-current" />}
                    {t('profile.addresses.primaryLabel')}
                  </span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(address)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t('common.edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeletingId(address.id)}
                    disabled={address.isPrimary}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                    title={address.isPrimary ? t('profile.addresses.deleteDisabledHint') : t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddressFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingAddress(null); }}
        onSave={handleSave}
        address={editingAddress}
        isSaving={createAddress.isPending || updateAddress.isPending}
        usedLocationTypes={modalUsedTypes}
      />

      <ConfirmDialog
        open={deletingId !== null}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingId(null)}
        title={t('profile.addresses.deleteTitle')}
        description={t('profile.addresses.deleteDescription')}
        confirmLabel={t('common.delete')}
        variant="danger"
      />

      <ReclassifyDialog
        open={reclassifyTarget !== null}
        currentType={reclassifyTarget?.currentType || ''}
        usedLocationTypes={reclassifyTarget?.freedTypeId
          ? usedLocationTypes.filter((t) => t !== reclassifyTarget.freedTypeId)
          : usedLocationTypes}
        onSelect={handleReclassify}
        onSkip={handleReclassifyDismiss}
        onClose={() => setReclassifyTarget(null)}
      />
    </div>
  );
}

function ReclassifyDialog({
  open,
  currentType,
  usedLocationTypes,
  onSelect,
  onSkip,
  onClose,
}: {
  open: boolean;
  currentType: string;
  usedLocationTypes: number[];
  onSelect: (locationTypeId: number) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const availableTypes = LOCATION_TYPES.filter((type) => !usedLocationTypes.includes(type.id));
  const defaultSkipType = availableTypes[0];

  const localizeType = (label: string) =>
    t(`profile.addresses.locationTypes.${label}`, { defaultValue: label });

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="block max-w-[calc(100%-2rem)] gap-0 rounded-xl border bg-card p-7 sm:max-w-sm"
      >
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            {t('profile.reclassify.title')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[0.88rem] leading-6 text-muted-foreground">
            {t('profile.reclassify.description', { type: localizeType(currentType) })}
          </DialogDescription>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {availableTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => onSelect(type.id)}
                className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                {localizeType(type.label)}
              </button>
            ))}
          </div>

          {defaultSkipType && (
            <button
              onClick={onSkip}
              className="mt-3 w-full rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              {t('profile.reclassify.skip', { type: localizeType(defaultSkipType.label) })}
            </button>
          )}
      </DialogContent>
    </Dialog>
  );
}
