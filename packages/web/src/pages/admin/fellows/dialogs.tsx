import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { FellowDashboardEntry } from '@itatti/shared';

function todayInputValue(): string {
  // Seeds the picker with the admin's local calendar date. The server stores
  // the selected day at noon UTC to avoid timezone rollover in normal use.
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

export function ConfirmResendDialog({
  open,
  fellowName,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fellowName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const { t } = useTranslation();

  // A real (nested) Base UI dialog, like NominationSentDialog below. The
  // previous hand-rolled sibling div was marked aria-hidden by the still-open
  // preview modal, making the confirmation invisible to assistive technology.
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !submitting) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="block max-w-[calc(100vw-2rem)] gap-0 rounded-lg border bg-card p-0 sm:max-w-md"
      >
        <div className="border-b px-5 py-4">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            {t('fellows.dialogs.resendTitle')}
          </DialogTitle>
        </div>
        <div className="space-y-3 px-5 py-4 text-[0.95rem] leading-6 text-muted-foreground">
          <p>{t('fellows.dialogs.resendBody', { name: fellowName })}</p>
          <p className="font-medium text-foreground">
            {t('fellows.dialogs.resendConfirmQuestion')}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            >
            {t('common.cancel')}
            </Button>
          <Button
            type="button"
            variant="outline"
            className="border-warning-border bg-warning text-warning-foreground hover:bg-warning-border/60 hover:text-warning-foreground"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {t('fellows.dialogs.sendAgain')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NominationSentDialog({
  open,
  fellow,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fellow: FellowDashboardEntry | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (nominationSentOn: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [nominationSentOn, setNominationSentOn] = useState(todayInputValue());

  useEffect(() => {
    if (open) setNominationSentOn(todayInputValue());
  }, [open, fellow?.civicrmId]);

  const fellowName = fellow ? `${fellow.firstName} ${fellow.lastName}` : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="block max-w-[calc(100vw-2rem)] gap-0 rounded-lg border bg-card p-0 sm:max-w-md"
      >
          <div className="border-b px-5 py-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              {t('fellows.dialogs.nominationTitle')}
            </DialogTitle>
          </div>
          {fellow && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onConfirm(nominationSentOn);
              }}
            >
              <div className="space-y-4 px-5 py-4">
                <p className="text-[0.95rem] leading-6 text-muted-foreground">
                  {t('fellows.dialogs.nominationBody', { name: fellowName })}
                </p>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    {t('fellows.dialogs.nominationDateLabel')}
                  </span>
                  <input
                    type="date"
                    lang="en-GB"
                    value={nominationSentOn}
                    onChange={(event) => setNominationSentOn(event.target.value)}
                    required
                    className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={submitting}
                  >
                  {t('common.cancel')}
                  </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </form>
          )}
      </DialogContent>
    </Dialog>
  );
}
