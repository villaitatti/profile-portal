import { useTranslation } from 'react-i18next';
import { VitIdStatusBadge } from '@/components/shared/VitIdStatusBadge';
import { AppointeeStatusBadge } from '@/components/shared/AppointeeStatusBadge';
import type {
  FellowDashboardEntry,
  FormInvitationSummaryEntry,
} from '@itatti/shared';
import { formatLabel } from './helpers';
import { BioEmailPill } from './BioEmailPill';
import { FormStatusCell } from './FormStatusCell';
import { FellowActionsMenu } from './FellowActionsMenu';

export function FellowRow({
  fellow,
  pendingContactId,
  onSendClick,
  onNominationSentClick,
}: {
  fellow: FellowDashboardEntry;
  pendingContactId: number | null;
  onSendClick: (
    kind: 'vit_id_invitation' | 'bio_project_description',
    mode?: 'send' | 'resend'
  ) => void;
  onNominationSentClick: (invitation: FormInvitationSummaryEntry) => void;
}) {
  const { t } = useTranslation();
  const isPending = pendingContactId === fellow.civicrmId;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
            {fellow.imageUrl ? (
              <img
                src={fellow.imageUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <span className="text-base font-medium text-primary">
                {fellow.firstName?.[0]}
                {fellow.lastName?.[0]}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="whitespace-nowrap text-[1rem] font-semibold">
              {fellow.firstName} {fellow.lastName}
            </div>
            <div className="text-[0.82rem] leading-5 text-muted-foreground truncate" title={fellow.email || undefined}>
              {fellow.email || (
                <span className="italic text-muted-foreground/60">{t('fellows.table.noEmail')}</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <AppointeeStatusBadge
          status={fellow.appointeeStatus}
          subLabel={
            fellow.vitIdInvitation.status === 'failed'
              ? t('fellows.table.lastSendFailed')
              : undefined
          }
          subLabelTone="destructive"
        />
      </td>
      <td className="px-3 py-3 text-[0.9rem] text-muted-foreground">
        {formatLabel(fellow.appointment)}
      </td>
      <td className="px-3 py-3 text-[0.9rem] text-muted-foreground">
        {formatLabel(fellow.fellowship)}
      </td>
      <td className="px-3 py-3">
        <FormStatusCell fellow={fellow} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <VitIdStatusBadge
            status={fellow.status}
            matchedVia={fellow.matchedVia}
            matched={fellow.matched}
            matchedViaEmail={fellow.matchedViaEmail}
            reason={fellow.reason}
            candidates={fellow.candidates}
          />
          {fellow.status === 'active-different-email' && fellow.matched && (
            <span className="text-[0.82rem] leading-5 text-muted-foreground">
              {t('fellows.table.vitIdOnFileUnder')}{' '}
              <span className="font-mono break-all whitespace-normal">
                {fellow.matched.email}
              </span>
            </span>
          )}
          {fellow.status === 'needs-review' &&
            fellow.candidates &&
            fellow.candidates.length > 0 && (
              <ul className="mt-1 space-y-1 text-[0.82rem] leading-5 text-muted-foreground">
                {fellow.candidates.map((c) => (
                  <li
                    key={c.userId}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                  >
                    <span className="font-mono break-all whitespace-normal">
                      {c.email}
                    </span>
                    {c.civicrmId && (
                      <span className="text-muted-foreground/70">
                        {t('fellows.table.civicrmId', { id: c.civicrmId })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </td>
      <td className="px-3 py-3">
        <BioEmailPill
          status={fellow.bioEmail.status}
          sentAt={fellow.bioEmail.sentAt}
          sendCount={fellow.bioEmail.sendCount}
          targetAcademicYear={fellow.bioEmail.targetAcademicYear}
        />
      </td>
      <td className="px-3 py-3 text-center">
        <FellowActionsMenu
          fellow={fellow}
          isPending={isPending}
          onSendClick={onSendClick}
          onNominationSentClick={onNominationSentClick}
        />
      </td>
    </tr>
  );
}
