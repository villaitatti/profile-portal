import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { CiviCRMPhone, CreatePhoneInput } from '@itatti/shared';

interface PhoneFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: CreatePhoneInput) => Promise<void>;
  phone: CiviCRMPhone | null;
  isSaving: boolean;
  error?: string | null;
}

const PHONE_TYPES = [
  { id: 1, label: 'Landline' },
  { id: 2, label: 'Mobile' },
];

export function PhoneFormModal({ open, onClose, onSave, phone, isSaving, error }: PhoneFormModalProps) {
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
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(29,37,44,0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-7 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] duration-200">
          <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
            {phone ? 'Edit phone number' : 'Add phone number'}
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Phone number<span className="ml-0.5 text-destructive">*</span>
              </span>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                placeholder="+1 (555) 123-4567"
                className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </label>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">Type</legend>
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
                    <span className="text-[0.95rem] text-foreground">{type.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
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
                disabled={isSaving || !phoneNumber.trim()}
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
