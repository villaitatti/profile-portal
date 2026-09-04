import { useTranslation } from 'react-i18next';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useGenerateFormInvitation } from '@/api/forms';
import { formatHumanDate } from '@/lib/dates';
import {
  AlertTriangle,
  Loader2,
  Repeat2,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import type { FellowDashboardEntry } from '@itatti/shared';
import { formatLabel, getPrimaryConfiguredForm, getFormInvitation } from './helpers';
import { useCopyFormLink } from './hooks';

export function FormLinkMenuItem({ fellow }: { fellow: FellowDashboardEntry }) {
  const { t, i18n } = useTranslation();
  const generateMutation = useGenerateFormInvitation();
  const { copied, copyFormLink } = useCopyFormLink(fellow);
  const configuredForm = getPrimaryConfiguredForm(fellow);

  const existingInvitation = getFormInvitation(fellow);

  async function handleGenerate() {
    if (!configuredForm) return;
    let token: string;
    try {
      const result = await generateMutation.mutateAsync({
        fellowshipId: fellow.fellowshipId,
        contactId: fellow.civicrmId,
        academicYear: fellow.fellowshipYear,
        formType: configuredForm.id,
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

  async function handleCopy() {
    if (!existingInvitation) return;
    await copyFormLink(existingInvitation.token);
  }

  if (!configuredForm) {
    return (
      <DropdownMenuItem
        disabled
        className="cursor-default items-start px-3 text-muted-foreground data-[disabled]:opacity-100"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
        <span className="flex flex-col">
          <span className="font-medium text-foreground">{t('fellows.form.noFormConfigured')}</span>
          <span className="text-xs leading-5">
            {t('fellows.form.noFormYet', {
              appointment:
                formatLabel(fellow.appointment) || t('fellows.form.thisAppointmentType'),
            })}
          </span>
        </span>
      </DropdownMenuItem>
    );
  }

  if (existingInvitation?.status === 'submitted') {
    return (
      <DropdownMenuItem
        disabled
        className="cursor-default px-3 text-success data-[disabled]:opacity-100"
      >
        <Check className="h-4 w-4" />
        <span className="flex flex-col">
          <span className="font-medium">{t('fellows.form.formDone')}</span>
          {existingInvitation.submittedAt && (
            <span className="text-xs text-muted-foreground">
              {t('fellows.form.submittedOn', {
                date: formatHumanDate(existingInvitation.submittedAt, i18n.language),
              })}
            </span>
          )}
        </span>
      </DropdownMenuItem>
    );
  }

  if (existingInvitation?.status === 'expired') {
    return (
      <DropdownMenuItem
        disabled={generateMutation.isPending}
        closeOnClick={false}
        onClick={() => {
          void handleGenerate();
        }}
        className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
      >
        {generateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-progress" />
        ) : (
          <Repeat2 className="h-4 w-4 text-progress" />
        )}
        <span>{t('fellows.form.generateNewLink')}</span>
      </DropdownMenuItem>
    );
  }

  if (existingInvitation) {
    return (
      <DropdownMenuItem
        closeOnClick={false}
        onClick={() => {
          void handleCopy();
        }}
        className="px-3 font-medium text-foreground"
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Copy className="h-4 w-4 text-progress" />
        )}
        <span>{copied ? t('fellows.form.copied') : t('fellows.form.copyLink')}</span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      disabled={generateMutation.isPending}
      closeOnClick={false}
      onClick={() => {
        void handleGenerate();
      }}
      className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
    >
      {generateMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-progress" />
      ) : (
        <FileText className="h-4 w-4 text-progress" />
      )}
      <span>{t('fellows.form.generateLink')}</span>
    </DropdownMenuItem>
  );
}
