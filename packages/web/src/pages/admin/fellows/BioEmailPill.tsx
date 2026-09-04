import { useTranslation } from 'react-i18next';
import { formatHumanDate, formatHumanDateTime } from '@/lib/dates';
import type { BioEmailStatus } from '@itatti/shared';

// Status badge moved to components/shared/VitIdStatusBadge.tsx (used by both
// this page and the Has VIT ID? page).

export function BioEmailPill({
  status,
  sentAt,
  sendCount,
  targetAcademicYear,
}: {
  status: BioEmailStatus;
  sentAt: string | null;
  sendCount: number;
  targetAcademicYear: string | null;
}) {
  const { t, i18n } = useTranslation();
  if (status === 'none') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[0.8rem] font-medium text-muted-foreground"
        title={t('fellows.bioEmail.noneTitle')}
      >
        —
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-warning px-2.5 py-0.5 text-[0.8rem] font-medium text-warning-foreground"
        title={
          targetAcademicYear
            ? t('fellows.bioEmail.pendingTitleYear', { year: targetAcademicYear })
            : t('fellows.bioEmail.pendingTitle')
        }
      >
        {t('fellows.bioEmail.pending')}
      </span>
    );
  }
  if (status === 'sent') {
    const resent = sendCount > 1;
    const label = sentAt
      ? t(resent ? 'fellows.bioEmail.resentOn' : 'fellows.bioEmail.sentOn', {
          date: formatHumanDate(sentAt, i18n.language),
        })
      : t(resent ? 'fellows.bioEmail.resent' : 'fellows.bioEmail.sent');
    const sentDateTime = sentAt ? formatHumanDateTime(sentAt, i18n.language) : null;
    const title = targetAcademicYear
      ? sentDateTime
        ? t(resent ? 'fellows.bioEmail.titleResentYearOn' : 'fellows.bioEmail.titleSentYearOn', {
            year: targetAcademicYear,
            date: sentDateTime,
          })
        : t(resent ? 'fellows.bioEmail.titleResentYear' : 'fellows.bioEmail.titleSentYear', {
            year: targetAcademicYear,
          })
      : sentDateTime
        ? t(resent ? 'fellows.bioEmail.titleResentOn' : 'fellows.bioEmail.titleSentOn', {
            date: sentDateTime,
          })
        : t(resent ? 'fellows.bioEmail.titleResent' : 'fellows.bioEmail.titleSent');
    return (
      <span
        className="inline-flex items-center rounded-full tone-success px-2.5 py-0.5 text-[0.8rem] font-medium"
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full tone-danger px-2.5 py-0.5 text-[0.8rem] font-medium"
      title={t('fellows.bioEmail.failedTitle')}
    >
      {t('fellows.bioEmail.failed')}
    </span>
  );
}
