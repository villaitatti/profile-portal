import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGenerateFormInvitation } from '@/api/forms';
import { formatHumanDate } from '@/lib/dates';
import { Copy, Check, Info, Loader2 } from 'lucide-react';
import type { FellowDashboardEntry } from '@itatti/shared';
import { formatLabel, getPrimaryConfiguredForm, getFormInvitation } from './helpers';
import { useCopyFormLink } from './hooks';

// Tokens are stored hashed on the server, so an existing invitation's raw
// link cannot be re-copied. This button mints a fresh link (invalidating the
// previous one — the title/aria say so) and copies it.
function CopyFormLinkButton({
  fellow,
  formType,
}: {
  fellow: FellowDashboardEntry;
  formType: string;
}) {
  const { t } = useTranslation();
  const generateMutation = useGenerateFormInvitation();
  const { copied, copyFormLink } = useCopyFormLink(fellow);

  async function handleClick() {
    let token: string;
    try {
      const result = await generateMutation.mutateAsync({
        fellowshipId: fellow.fellowshipId,
        contactId: fellow.civicrmId,
        academicYear: fellow.fellowshipYear,
        formType,
      });
      token = result.token;
    } catch {
      toast.error(t('fellows.form.generateFailed'));
      return;
    }

    await copyFormLink(token, {
      onCopyFailure: () =>
        toast.success(
          t('fellows.form.generatedCopyManually', {
            name: `${fellow.firstName} ${fellow.lastName}`,
          })
        ),
    });
  }

  return (
    <button
      type="button"
      disabled={generateMutation.isPending}
      onClick={() => {
        void handleClick();
      }}
      title={t('fellows.form.copyNewLink')}
      aria-label={t('fellows.form.copyNewLinkAria', {
        name: `${fellow.firstName} ${fellow.lastName}`,
      })}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {generateMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

export function FormStatusCell({ fellow }: { fellow: FellowDashboardEntry }) {
  const { t, i18n } = useTranslation();
  const configuredForm = getPrimaryConfiguredForm(fellow);
  const invitation = getFormInvitation(fellow);

  let label = t('fellows.form.ready');
  let tone = 'tone-neutral';
  let description = t('fellows.form.readyDescription');
  let subLabel: string | null = null;
  let canCopy = false;

  if (!configuredForm) {
    label = t('fellows.form.notConfigured');
    tone = 'tone-danger';
    description = t('fellows.form.notConfiguredDescription', {
      appointment: formatLabel(fellow.appointment) || t('fellows.form.thisAppointmentType'),
    });
  } else if (invitation?.status === 'submitted') {
    label = t('fellows.form.submitted');
    tone = 'tone-success';
    description = t('fellows.form.submittedDescription');
    subLabel = invitation.submittedAt
      ? t('fellows.form.onDate', {
          date: formatHumanDate(invitation.submittedAt, i18n.language),
        })
      : null;
  } else if (invitation?.status === 'expired') {
    label = t('fellows.form.expired');
    tone = 'tone-neutral';
    description = t('fellows.form.expiredDescription');
  } else if (invitation?.nominationSentAt) {
    label = t('fellows.form.waiting');
    tone = 'tone-warning';
    description = t('fellows.form.waitingDescription');
    subLabel = t('fellows.form.sentDate', {
      date: formatHumanDate(invitation.nominationSentAt, i18n.language),
    });
    canCopy = true;
  } else if (invitation) {
    label = t('fellows.form.linkGenerated');
    tone = 'tone-neutral';
    description = t('fellows.form.linkGeneratedDescription');
    canCopy = true;
  }

  return (
    <div className="inline-flex items-start gap-1.5">
      <div className="flex flex-col items-start gap-1">
        <div className="inline-flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium ${tone}`}>
            {label}
          </span>
          {canCopy && configuredForm && (
            <CopyFormLinkButton fellow={fellow} formType={configuredForm.id} />
          )}
        </div>
        {subLabel && (
          <span className="text-[0.82rem] leading-4 text-muted-foreground">
            {subLabel}
          </span>
        )}
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={t('fellows.form.statusPopoverAria')}
              className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          }
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          sideOffset={6}
          className="block w-72 gap-0 rounded-lg border bg-card p-4 text-[0.88rem] leading-5 text-foreground shadow-lg"
        >
          <div className="mb-1 font-semibold text-sm">{t('fellows.form.statusPopoverTitle')}</div>
          <p className="text-muted-foreground">{description}</p>
          {configuredForm && (
            <p className="mt-3 text-[0.82rem] text-muted-foreground">
              {t('fellows.form.configuredForm', { title: configuredForm.title })}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
