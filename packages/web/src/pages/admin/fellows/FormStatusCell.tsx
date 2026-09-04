import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatHumanDate } from '@/lib/dates';
import { Copy, Check, Info } from 'lucide-react';
import type {
  FellowDashboardEntry,
  FormInvitationSummaryEntry,
} from '@itatti/shared';
import { formatLabel, getPrimaryConfiguredForm, getFormInvitation } from './helpers';
import { useCopyFormLink } from './hooks';

function CopyFormLinkButton({
  fellow,
  invitation,
}: {
  fellow: FellowDashboardEntry;
  invitation: FormInvitationSummaryEntry;
}) {
  const { t } = useTranslation();
  const { copied, copyFormLink } = useCopyFormLink(fellow);

  return (
    <button
      type="button"
      onClick={() => {
        void copyFormLink(invitation.token);
      }}
      title={t('fellows.form.copyLink')}
      aria-label={t('fellows.form.copyLinkAria', {
        name: `${fellow.firstName} ${fellow.lastName}`,
      })}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {copied ? (
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
          {canCopy && invitation && (
            <CopyFormLinkButton fellow={fellow} invitation={invitation} />
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
