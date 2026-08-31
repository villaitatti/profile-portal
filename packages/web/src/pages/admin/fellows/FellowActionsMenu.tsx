import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getCivicrmUrl } from '@/config/runtime';
import {
  ExternalLink,
  AlertTriangle,
  Mail,
  UserPlus,
  Loader2,
  Repeat2,
  MoreHorizontal,
  CalendarCheck,
} from 'lucide-react';
import type {
  FellowDashboardEntry,
  FormInvitationSummaryEntry,
} from '@itatti/shared';
import { getFormInvitation } from './helpers';
import { FormLinkMenuItem } from './FormLinkMenuItem';

export function FellowActionsMenu({
  fellow,
  isPending,
  onSendClick,
  onNominationSentClick,
}: {
  fellow: FellowDashboardEntry;
  isPending: boolean;
  onSendClick: (
    kind: 'vit_id_invitation' | 'bio_project_description',
    mode?: 'send' | 'resend'
  ) => void;
  onNominationSentClick: (invitation: FormInvitationSummaryEntry) => void;
}) {
  const { t } = useTranslation();
  const formInvitation = getFormInvitation(fellow);
  const civicrmUrl = getCivicrmUrl();
  const canMarkNominationSent =
    !!formInvitation &&
    formInvitation.status === 'pending' &&
    !formInvitation.nominationSentAt;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('fellows.actions.openMenuAria', {
              name: `${fellow.firstName} ${fellow.lastName}`,
            })}
          />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[15rem]">
          <FormLinkMenuItem fellow={fellow} />

          {canMarkNominationSent && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => {
                if (formInvitation) onNominationSentClick(formInvitation);
              }}
              className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span>{t('fellows.actions.nominationSent')}</span>
            </DropdownMenuItem>
          )}

          {fellow.vitIdInvitation.canManuallySend && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onSendClick('vit_id_invitation')}
              className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <UserPlus className="h-4 w-4 text-primary" />
              )}
              <span>{t('fellows.actions.sendVitIdEmail')}</span>
            </DropdownMenuItem>
          )}

          {fellow.status === 'needs-review' && (
            <DropdownMenuItem
              disabled
              className="cursor-default items-start px-3 text-muted-foreground data-[disabled]:opacity-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{t('fellows.actions.sendDisabled')}</span>
                <span className="text-xs leading-5">
                  {t('fellows.actions.resolveConflictFirst')}
                </span>
              </span>
            </DropdownMenuItem>
          )}

          {fellow.bioEmail.canManuallySend && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onSendClick('bio_project_description')}
              className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span>{t('fellows.actions.sendBioEmail')}</span>
            </DropdownMenuItem>
          )}

          {fellow.bioEmail.status === 'sent' && fellow.bioEmail.targetAcademicYear && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onSendClick('bio_project_description', 'resend')}
              className="px-3 font-medium text-amber-900 data-highlighted:bg-amber-50 data-highlighted:text-amber-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:text-amber-500 dark:data-highlighted:bg-amber-950 dark:data-highlighted:text-amber-500"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Repeat2 className="h-4 w-4" />
              )}
              <span>{t('fellows.actions.resendBioEmail')}</span>
            </DropdownMenuItem>
          )}

          {civicrmUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <a
                    href={`${civicrmUrl}/civicrm/contact/view?reset=1&cid=${fellow.civicrmId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                className="px-3 font-medium text-primary data-highlighted:text-primary"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{t('fellows.actions.openInCivicrm')}</span>
              </DropdownMenuItem>
            </>
          )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
