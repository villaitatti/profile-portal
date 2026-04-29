import { useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useAddresses,
  useCreateAddress,
  useUpdateAddress,
  useDeleteAddress,
  useSetPreferredAddress,
} from '@/api/contact';
import { AddressFormModal } from './AddressFormModal';
import type { CiviCRMAddress, CreateAddressInput, UpdateAddressInput } from '@itatti/shared';

export function AddressSection() {
  const { data: addresses, isLoading, error, refetch } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const setPreferred = useSetPreferredAddress();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CiviCRMAddress | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      setSaveError(null);
      if (editingAddress) {
        const updateInput: UpdateAddressInput & { id: number } = { id: editingAddress.id, ...input };
        await updateAddress.mutateAsync(updateInput);
      } else {
        await createAddress.mutateAsync(input);
      }
      setModalOpen(false);
      setEditingAddress(null);
    } catch {
      setSaveError('Failed to save address. Please try again.');
    }
  }

  async function handleDelete() {
    if (deletingId !== null) {
      try {
        setDeleteError(null);
        await deleteAddress.mutateAsync(deletingId);
        setDeletingId(null);
      } catch {
        setDeleteError('Failed to delete address. Please try again.');
      }
    }
  }

  function handlePreferred(id: number) {
    setPreferred.mutate(id);
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
        This is the address I Tatti would use if we need to send you anything by post.
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
              className="rounded-lg border p-4"
            >
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
                    Send mail here
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
        onClose={() => { setModalOpen(false); setEditingAddress(null); setSaveError(null); }}
        onSave={handleSave}
        address={editingAddress}
        isSaving={createAddress.isPending || updateAddress.isPending}
        error={saveError}
      />

      <ConfirmDialog
        open={deletingId !== null}
        onConfirm={handleDelete}
        onCancel={() => { setDeletingId(null); setDeleteError(null); }}
        title="Delete address"
        description={deleteError || 'Delete this address? This cannot be undone.'}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
