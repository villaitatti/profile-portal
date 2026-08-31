import type {
  FellowDashboardEntry,
  FormInvitationSummaryEntry,
} from '@itatti/shared';

export type SortField =
  | 'name'
  | 'appointment'
  | 'fellowship'
  | 'appointeeStatus'
  | 'form'
  | 'status'
  | 'bioEmail';
export type SortDir = 'asc' | 'desc';

/**
 * Which email the preview modal is set up for. Null = closed.
 */
export type ActiveSend = {
  fellow: FellowDashboardEntry;
  kind: 'vit_id_invitation' | 'bio_project_description';
  mode?: 'send' | 'resend';
};

export type ActiveNominationSent = {
  fellow: FellowDashboardEntry;
  invitation: FormInvitationSummaryEntry;
};
