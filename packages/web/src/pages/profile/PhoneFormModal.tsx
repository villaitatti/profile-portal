import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { CiviCRMPhone, CreatePhoneInput } from '@itatti/shared';

interface PhoneFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: CreatePhoneInput) => Promise<void>;
  phone: CiviCRMPhone | null;
  isSaving: boolean;
}

const PHONE_TYPES = [
  { id: 1, labelKey: 'profile.phones.types.landline' },
  { id: 2, labelKey: 'profile.phones.types.mobile' },
];

export function PhoneFormModal({ open, onClose, onSave, phone, isSaving }: PhoneFormModalProps) {
  const { t } = useTranslation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneTypeId, setPhoneTypeId] = useState(1);

  useEffect(() => {
    if (open) {
      if (phone) {
        setPhoneNumber(phone.phone || '');
        setPhoneTypeId(phone.phoneTypeId);
      } else {
        setPhoneNumber('');
        setPhoneTypeId(1);
      }
    }
  }, [open, phone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    await onSave({
      phone: phoneNumber.trim(),
      phoneTypeId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] gap-0 rounded-xl border bg-card p-7 sm:max-w-md"
      >
        <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
          {phone ? t('profile.phoneForm.editTitle') : t('profile.phoneForm.addTitle')}
        </DialogTitle>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {t('profile.phoneForm.numberLabel')}<span className="ml-0.5 text-destructive">*</span>
            </span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              placeholder={t('profile.phoneForm.numberPlaceholder')}
              className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </label>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-foreground">{t('profile.phoneForm.typeLabel')}</legend>
            <div className="flex gap-4">
              {PHONE_TYPES.map((type) => (
                <label key={type.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="phone-type"
                    value={type.id}
                    checked={phoneTypeId === type.id}
                    onChange={() => setPhoneTypeId(type.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-[0.95rem] text-foreground">{t(type.labelKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
              disabled={isSaving || !phoneNumber.trim()}
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
