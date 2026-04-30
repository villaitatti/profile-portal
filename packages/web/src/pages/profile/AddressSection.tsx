import { useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
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
import { LOCATION_TYPES } from '@itatti/shared';
import type { CiviCRMAddress, CreateAddressInput, UpdateAddressInput } from '@itatti/shared';

export function AddressSection() {
  const { data: addresses, isLoading, error, refetch } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const setPreferred = useSetPreferredAddress();
  const reclassify = useReclassifyAddress();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CiviCRMAddress | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reclassifyTarget, setReclassifyTarget] = useState<{ id: number; currentType: string } | null>(null);

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
      const result = await setPreferred.mutateAsync(id);
      if (result.oldPrimaryId) {
        setReclassifyTarget({
          id: result.oldPrimaryId,
          currentType: result.oldPrimaryLocationType || 'Main',
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
      reclassify.mutate({ id: reclassifyTarget.id, locationTypeId: 1 });
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
          <h2 className="text-lg font-semibold tracking-tight">Postal Addresses</h2>
        </div>
        <p className="mt-4 text-[0.95rem] text-muted-foreground">
          Unable to load addresses. Please try again later.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6 md:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Postal Addresses</h2>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add address
        </button>
      </div>

      <p className="mt-2 text-[0.88rem] leading-6 text-muted-foreground">
        Select a primary address — this is where I Tatti will send any postal correspondence.
      </p>

      {addresses && addresses.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-center">
          <p className="text-[0.95rem] text-muted-foreground">
            No addresses on file. Add one so I Tatti can reach you by post.
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
                  {address.locationType}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="preferred-address"
                    checked={address.isPrimary}
                    onChange={() => handlePreferred(address.id)}
                    className="h-4 w-4 text-primary accent-primary"
                  />
                  <span className={address.isPrimary ? 'font-medium text-primary' : 'text-muted-foreground'}>
                    Primary address
                  </span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(address)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeletingId(address.id)}
                    disabled={address.isPrimary}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                    title={address.isPrimary ? 'Select a different preferred address first' : 'Delete'}
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
      />

      <ConfirmDialog
        open={deletingId !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        title="Delete address"
        description="Delete this address? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

      <ReclassifyDialog
        open={reclassifyTarget !== null}
        currentType={reclassifyTarget?.currentType || ''}
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
  onSelect,
  onSkip,
  onClose,
}: {
  open: boolean;
  currentType: string;
  onSelect: (locationTypeId: number) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(29,37,44,0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-7 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] duration-200">
          <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
            Reclassify previous address
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[0.88rem] leading-6 text-muted-foreground">
            The previous primary address was labeled &ldquo;{currentType}&rdquo;. What type should it be now?
          </Dialog.Description>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {LOCATION_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => onSelect(type.id)}
                className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                {type.label}
              </button>
            ))}
          </div>

          <button
            onClick={onSkip}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            Skip (default to Home)
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
