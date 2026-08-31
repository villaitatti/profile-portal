import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmailPreviewModal } from '@/components/shared/EmailPreviewModal';
import {
  useSendBioEmail,
  useSendVitIdEmail,
  useEmailPreview,
  SendBioEmailError,
  SendVitIdEmailError,
  EmailPreviewError,
  type SendBioEmailReason,
  type SendVitIdEmailReason,
  type EmailPreviewReason,
  type EmailPreviewType,
} from '@/api/fellows';
import { useMarkNominationSent } from '@/api/forms';
import { formatHumanDate } from '@/lib/dates';
import type { FellowDashboardEntry } from '@itatti/shared';
import type { SortField, SortDir, ActiveSend, ActiveNominationSent } from './types';
import { getPrimaryConfiguredForm, getFormInvitation } from './helpers';
import { SortableHeader } from '@/components/shared/SortableHeader';
import { FellowRow } from './FellowRow';
import { ConfirmResendDialog, NominationSentDialog } from './dialogs';

// Reason → i18n key maps; translated with t() at usage time so the copy
// follows the active language.
const BIO_EMAIL_ERROR_KEYS: Record<SendBioEmailReason, string> = {
  no_vit_id: 'fellows.errors.noVitId',
  no_matching_fellowship: 'fellows.errors.noMatchingFellowship',
  fellowship_not_accepted: 'fellows.errors.fellowshipNotAccepted',
  no_primary_email: 'fellows.errors.noPrimaryEmail',
  already_sent: 'fellows.errors.bioAlreadySent',
  civicrm_unavailable: 'fellows.errors.civicrmUnavailable',
  email_send_failed: 'fellows.errors.emailSendFailed',
};

const VIT_ID_EMAIL_ERROR_KEYS: Record<SendVitIdEmailReason, string> = {
  no_matching_fellowship: 'fellows.errors.noMatchingFellowship',
  fellowship_not_accepted: 'fellows.errors.fellowshipNotAccepted',
  no_primary_email: 'fellows.errors.noPrimaryEmail',
  missing_first_name: 'fellows.errors.missingFirstName',
  already_has_vit_id: 'fellows.errors.alreadyHasVitId',
  needs_review: 'fellows.errors.needsReview',
  already_sent: 'fellows.errors.vitIdAlreadySent',
  civicrm_unavailable: 'fellows.errors.civicrmUnavailable',
  email_send_failed: 'fellows.errors.emailSendFailed',
};

// Preview-specific reasons (contact_not_found is a 404 unique to the preview
// endpoint; civicrm_unavailable + no_primary_email + missing_first_name reuse
// the send-side copy but are repeated here so the Record is exhaustive and
// future reason additions surface as TS errors).
const EMAIL_PREVIEW_ERROR_KEYS: Record<EmailPreviewReason, string> = {
  missing_first_name: 'fellows.errors.missingFirstName',
  no_primary_email: 'fellows.errors.noPrimaryEmail',
  contact_not_found: 'fellows.errors.contactNotFound',
  civicrm_unavailable: 'fellows.errors.civicrmUnavailable',
};

const FELLOWS_PER_PAGE = 50;

export function FellowsTable({ fellows, paginate }: { fellows: FellowDashboardEntry[]; paginate: boolean }) {
  const { t, i18n } = useTranslation();
  // Default sort: appointment asc → lastName asc. Groups fellows by role type
  // (Fellow, Visiting Fellow, Visiting Professor, ...), then alphabetical
  // within each group. Amber/red badges carry the attention signal.
  const [sortField, setSortField] = useState<SortField>('appointment');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [activeSend, setActiveSend] = useState<ActiveSend | null>(null);
  const [activeNominationSent, setActiveNominationSent] =
    useState<ActiveNominationSent | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
  const sendBioEmail = useSendBioEmail();
  const sendVitIdEmail = useSendVitIdEmail();
  const markNominationSent = useMarkNominationSent();
  const [pendingContactId, setPendingContactId] = useState<number | null>(null);

  // Preview fetches when modal is open; each open triggers a fresh preview.
  const previewQuery = useEmailPreview({
    contactId: activeSend?.fellow.civicrmId ?? null,
    type: (activeSend?.kind as EmailPreviewType) ?? 'bio_project_description',
    academicYear:
      (activeSend?.kind === 'vit_id_invitation'
        ? activeSend.fellow.vitIdInvitation.targetAcademicYear
        : activeSend?.fellow.bioEmail.targetAcademicYear) ?? null,
    enabled: activeSend !== null,
  });

  // Reset transient modal state when we open a new preview.
  useEffect(() => {
    if (activeSend) {
      setSendError(null);
      setResendConfirmOpen(false);
    }
  }, [activeSend]);

  // Reset to page 1 when the underlying data changes (filter/search/year)
  useEffect(() => setPage(1), [fellows]);

  const sorted = useMemo(() => {
    return [...fellows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          break;
        case 'appointment':
          cmp =
            (a.appointment || '').localeCompare(b.appointment || '') ||
            a.lastName.localeCompare(b.lastName) ||
            a.firstName.localeCompare(b.firstName);
          break;
        case 'fellowship':
          cmp = (a.fellowship || '').localeCompare(b.fellowship || '');
          break;
        case 'appointeeStatus': {
          // Order reflects the onboarding pipeline, not alphabetical labels.
          // Angela scans the column top-down and sees "what needs my attention
          // next" in flow order.
          const order: Record<
            FellowDashboardEntry['appointeeStatus'],
            number
          > = {
            nominated: 0,
            'nomination-sent': 1,
            'form-submitted': 2,
            accepted: 3,
            'vit-id-sent': 4,
            'vit-id-claimed': 5,
            enrolled: 6,
          };
          cmp = order[a.appointeeStatus] - order[b.appointeeStatus];
          break;
        }
        case 'form': {
          const priority = (fellow: FellowDashboardEntry): number => {
            const invitation = getFormInvitation(fellow);
            if (!getPrimaryConfiguredForm(fellow)) return 5;
            if (!invitation) return 0;
            if (invitation.status === 'submitted') return 4;
            if (invitation.status === 'expired') return 3;
            if (invitation.nominationSentAt) return 2;
            return 1;
          };
          cmp = priority(a) - priority(b);
          break;
        }
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'bioEmail': {
          // Semantic priority instead of alphabetic: actionable states first
          // (failed = needs retry, none = send candidate) so Angela sees rows
          // requiring attention at the top, then pending (in-flight), then
          // sent (already done). Lexicographic order would put "failed"
          // between "—" and "pending", which is confusing.
          const priority: Record<typeof a.bioEmail.status, number> = {
            failed: 0,
            none: 1,
            pending: 2,
            sent: 3,
          };
          cmp = priority[a.bioEmail.status] - priority[b.bioEmail.status];
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [fellows, sortField, sortDir]);

  const totalPages = paginate ? Math.ceil(sorted.length / FELLOWS_PER_PAGE) : 1;
  const paginated = paginate
    ? sorted.slice((page - 1) * FELLOWS_PER_PAGE, page * FELLOWS_PER_PAGE)
    : sorted;

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleConfirmSend() {
    if (activeSend?.kind === 'bio_project_description' && activeSend.mode === 'resend') {
      setResendConfirmOpen(true);
      return;
    }
    await sendActiveEmail();
  }

  async function sendActiveEmail() {
    if (!activeSend) return;
    const { fellow, kind, mode } = activeSend;
    const targetYear =
      kind === 'vit_id_invitation'
        ? fellow.vitIdInvitation.targetAcademicYear
        : fellow.bioEmail.targetAcademicYear;
    if (!targetYear) {
      setSendError(t('fellows.send.noTargetYear'));
      return;
    }

    setPendingContactId(fellow.civicrmId);
    setSendError(null);
    try {
      if (kind === 'vit_id_invitation') {
        const result = await sendVitIdEmail.mutateAsync({
          contactId: fellow.civicrmId,
          academicYear: targetYear,
        });
        const label = `${fellow.firstName} ${fellow.lastName}`;
        if (result.status === 'SENT') {
          toast.success(t('fellows.send.vitIdSentTo', { name: label }));
        } else {
          toast.success(
            t('fellows.send.vitIdQueued', {
              name: label,
              status: result.status.toLowerCase(),
            })
          );
        }
        setActiveSend(null);
      } else {
        const result = await sendBioEmail.mutateAsync({
          contactId: fellow.civicrmId,
          academicYear: targetYear,
          resend: mode === 'resend',
        });
        const label = `${fellow.firstName} ${fellow.lastName}`;
        if (result.status === 'SENT') {
          toast.success(
            mode === 'resend'
              ? t('fellows.send.bioResentTo', { name: label })
              : t('fellows.send.bioSentTo', { name: label })
          );
        } else {
          toast.success(
            t(mode === 'resend' ? 'fellows.send.bioResendQueued' : 'fellows.send.bioQueued', {
              name: label,
              status: result.status.toLowerCase(),
            })
          );
        }
        setActiveSend(null);
      }
    } catch (err) {
      // Inline error in the modal so Angela can retry without reopening;
      // this matches the design-review decision (inline banner > toast close).
      if (err instanceof SendVitIdEmailError) {
        setSendError(
          VIT_ID_EMAIL_ERROR_KEYS[err.reason]
            ? t(VIT_ID_EMAIL_ERROR_KEYS[err.reason])
            : t('fellows.send.vitIdFailedFallback', { reason: err.reason })
        );
      } else if (err instanceof SendBioEmailError) {
        setSendError(
          BIO_EMAIL_ERROR_KEYS[err.reason]
            ? t(BIO_EMAIL_ERROR_KEYS[err.reason])
            : t('fellows.send.bioFailedFallback', { reason: err.reason })
        );
      } else {
        setSendError(
          err instanceof Error ? err.message : t('fellows.send.genericFailed')
        );
      }
    } finally {
      setPendingContactId(null);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" tabIndex={0} role="region" aria-label={t('fellows.manage.tableAria')}>
        <table className="w-full text-[0.95rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortableHeader field="name" label={t('fellows.table.name')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <SortableHeader field="appointeeStatus" label={t('fellows.table.appointeeStatus')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <SortableHeader field="appointment" label={t('fellows.table.appointment')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <SortableHeader field="fellowship" label={t('fellows.table.fellowshipType')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <SortableHeader field="form" label={t('fellows.table.form')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <SortableHeader field="status" label={t('fellows.table.vitIdStatus')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <SortableHeader field="bioEmail" label={t('fellows.table.bioEmail')} sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="px-3 py-3" buttonClassName="text-[0.75rem]" />
              <th className="px-3 py-3 text-center text-[0.75rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t('fellows.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map((fellow) => (
              <FellowRow
                key={fellow.civicrmId}
                fellow={fellow}
                pendingContactId={pendingContactId}
                onSendClick={(kind, mode) => setActiveSend({ fellow, kind, mode })}
                onNominationSentClick={(invitation) =>
                  setActiveNominationSent({ fellow, invitation })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      <EmailPreviewModal
        open={activeSend !== null}
        onCancel={() => {
          if (pendingContactId !== null) return; // don't close mid-send
          setActiveSend(null);
          setSendError(null);
        }}
        onConfirm={handleConfirmSend}
        title={
          activeSend?.kind === 'vit_id_invitation'
            ? t('fellows.send.vitIdTitle', {
                name: `${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`,
              })
            : activeSend
              ? t(
                  activeSend.mode === 'resend'
                    ? 'fellows.send.bioResendTitle'
                    : 'fellows.send.bioTitle',
                  { name: `${activeSend.fellow.firstName} ${activeSend.fellow.lastName}` }
                )
              : ''
        }
        confirmLabel={t('fellows.send.confirm')}
        notice={
          activeSend?.kind === 'bio_project_description' && activeSend.mode === 'resend'
            ? activeSend.fellow.bioEmail.sentAt
              ? t('fellows.send.resendNoticeDate', {
                  date: formatHumanDate(activeSend.fellow.bioEmail.sentAt, i18n.language),
                })
              : t('fellows.send.resendNotice')
            : null
        }
        preview={
          previewQuery.data
            ? {
                to: previewQuery.data.to,
                bcc: previewQuery.data.bcc,
                subject: previewQuery.data.subject,
                body: previewQuery.data.body,
                bodyFormat: previewQuery.data.bodyFormat,
              }
            : null
        }
        previewError={
          previewQuery.error
            ? previewQuery.error instanceof EmailPreviewError
              ? EMAIL_PREVIEW_ERROR_KEYS[previewQuery.error.reason]
                ? t(EMAIL_PREVIEW_ERROR_KEYS[previewQuery.error.reason])
                : t('fellows.send.previewFailedFallback', {
                    reason: previewQuery.error.reason,
                  })
              : (previewQuery.error as Error).message
            : null
        }
        sendError={sendError}
        submitting={pendingContactId !== null}
      />
      <NominationSentDialog
        open={activeNominationSent !== null}
        fellow={activeNominationSent?.fellow ?? null}
        submitting={markNominationSent.isPending}
        onCancel={() => {
          if (!markNominationSent.isPending) setActiveNominationSent(null);
        }}
        onConfirm={async (nominationSentOn) => {
          if (!activeNominationSent) return;
          try {
            await markNominationSent.mutateAsync({
              invitationId: activeNominationSent.invitation.id,
              nominationSentOn,
            });
            toast.success(
              t('fellows.dialogs.nominationSaved', {
                name: `${activeNominationSent.fellow.firstName} ${activeNominationSent.fellow.lastName}`,
              })
            );
            setActiveNominationSent(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : t('fellows.errors.saveNominationFailed')
            );
          }
        }}
      />
      <ConfirmResendDialog
        open={resendConfirmOpen}
        fellowName={
          activeSend
            ? `${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`
            : ''
        }
        submitting={pendingContactId !== null}
        onCancel={() => setResendConfirmOpen(false)}
        onConfirm={async () => {
          setResendConfirmOpen(false);
          await sendActiveEmail();
        }}
      />
      {paginate && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t('fellows.table.showing', {
              from: (page - 1) * FELLOWS_PER_PAGE + 1,
              to: Math.min(page * FELLOWS_PER_PAGE, sorted.length),
              total: sorted.length,
            })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('fellows.table.previous')}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('fellows.table.next')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
