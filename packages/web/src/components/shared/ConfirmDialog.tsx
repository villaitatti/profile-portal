import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(29,37,44,0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-7 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] duration-200">
          <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-[0.95rem] leading-7 text-muted-foreground">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium text-white transition-colors',
                variant === 'danger'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-primary hover:bg-primary/90'
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
