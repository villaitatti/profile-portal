import type {
  FellowDashboardEntry,
  FormDef,
  FormInvitationSummaryEntry,
} from '@itatti/shared';
import { getFormsForFellowship } from '@itatti/shared';

export function formatLabel(value?: string): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
}

function getConfiguredForms(fellow: FellowDashboardEntry): FormDef[] {
  return getFormsForFellowship(fellow.appointment || '', fellow.fellowship);
}

export function getPrimaryConfiguredForm(fellow: FellowDashboardEntry): FormDef | null {
  // v0.13 intentionally handles one configured form per appointment type.
  // When a second form is added, render one status per configured form here.
  return getConfiguredForms(fellow)[0] ?? null;
}

export function getFormInvitation(
  fellow: FellowDashboardEntry
): FormInvitationSummaryEntry | null {
  const form = getPrimaryConfiguredForm(fellow);
  if (!form) return null;
  return (
    fellow.formInvitations.find(
      (inv) =>
        inv.fellowshipId === fellow.fellowshipId &&
        inv.academicYear === fellow.fellowshipYear &&
        inv.formType === form.id &&
        (inv.status === 'pending' ||
          inv.status === 'submitted' ||
          inv.status === 'expired')
    ) ?? null
  );
}
