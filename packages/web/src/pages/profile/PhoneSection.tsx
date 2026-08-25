import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Plus, Pencil, Trash2, RefreshCw, Star } from 'lucide-react';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  usePhones,
  useCreatePhone,
  useUpdatePhone,
  useDeletePhone,
  useSetPreferredPhone,
} from '@/api/contact';
import { PhoneFormModal } from './PhoneFormModal';
import type { CiviCRMPhone, CreatePhoneInput, UpdatePhoneInput } from '@itatti/shared';

// Maps CiviCRM phone-type identifiers to i18n keys; identifiers themselves are
// API values and stay untranslated.
const PHONE_TYPE_KEYS: Record<string, string> = {
  Phone: 'profile.phones.types.landline',
  Mobile: 'profile.phones.types.mobile',
};

export function PhoneSection() {
  const { t } = useTranslation();
  const { data: phones, isLoading, error, refetch } = usePhones();
  const createPhone = useCreatePhone();
  const updatePhone = useUpdatePhone();
  const deletePhone = useDeletePhone();
  const setPreferred = useSetPreferredPhone();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPhone, setEditingPhone] = useState<CiviCRMPhone | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function handleAdd() {
    setEditingPhone(null);
    setModalOpen(true);
  }

  function handleEdit(phone: CiviCRMPhone) {
    setEditingPhone(phone);
    setModalOpen(true);
  }

  async function handleSave(input: CreatePhoneInput) {
    try {
      if (editingPhone) {
        const updateInput: UpdatePhoneInput & { id: number } = { id: editingPhone.id, ...input };
        await updatePhone.mutateAsync(updateInput);
      } else {
        await createPhone.mutateAsync(input);
      }
      setModalOpen(false);
      setEditingPhone(null);
    } catch { /* handled by mutation onError */ }
  }

  async function handleDelete() {
    if (deletingId !== null) {
      try {
        await deletePhone.mutateAsync(deletingId);
        setDeletingId(null);
      } catch { /* handled by mutation onError */ }
    }
  }

  function handlePreferred(id: number) {
    setPreferred.mutate(id);
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 md:px-8 motion-safe:animate-pulse">
        <SkeletonBlock className="h-5 w-40 rounded-full" />
        <SkeletonBlock className="mt-4 h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-6 md:px-8">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">{t('profile.phones.title')}</h2>
        </div>
        <p className="mt-4 text-[0.95rem] text-muted-foreground">
          {t('profile.phones.loadError')}
        </p>
        <button
          onClick={() => refetch()}
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
          <Phone className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">{t('profile.phones.title')}</h2>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('profile.phones.add')}
        </button>
      </div>

      <p className="mt-2 text-[0.88rem] leading-6 text-muted-foreground">
        <Star className="inline h-3.5 w-3.5 fill-primary text-primary -mt-0.5" /> {t('profile.phones.primaryHint')}
      </p>

      {phones && phones.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-center">
          <p className="text-[0.95rem] text-muted-foreground">
            {t('profile.phones.empty')}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {phones?.map((phone) => (
            <div
              key={phone.id}
              className="rounded-lg border p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-center gap-3">
                <span className="text-[0.95rem] leading-6 text-foreground">{phone.phone}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.78rem] font-medium text-muted-foreground">
                  {PHONE_TYPE_KEYS[phone.phoneType] ? t(PHONE_TYPE_KEYS[phone.phoneType]) : phone.phoneType}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="preferred-phone"
                    checked={phone.isPrimary}
                    onChange={() => handlePreferred(phone.id)}
                    className="h-4 w-4 text-primary accent-primary"
                  />
                  <span className={`flex items-center gap-1 ${phone.isPrimary ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
                    {phone.isPrimary && <Star className="h-3.5 w-3.5 fill-current" />}
                    {t('profile.phones.primaryLabel')}
                  </span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(phone)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t('common.edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeletingId(phone.id)}
                    disabled={phone.isPrimary}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                    title={phone.isPrimary ? t('profile.phones.deleteDisabledHint') : t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PhoneFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingPhone(null); }}
        onSave={handleSave}
        phone={editingPhone}
        isSaving={createPhone.isPending || updatePhone.isPending}
      />

      <ConfirmDialog
        open={deletingId !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        title={t('profile.phones.deleteTitle')}
        description={t('profile.phones.deleteDescription')}
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </div>
  );
}
