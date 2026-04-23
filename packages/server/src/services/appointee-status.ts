import type { AppointeeStatus, VitIdStatus } from '@itatti/shared';
import { logger } from '../lib/logger.js';

/**
 * Full lifecycle event status, mirroring AppointeeEmailStatus in Prisma
 * but extended with 'NONE' for "no event row exists yet".
 *
 * Passed instead of a plain boolean so we can surface FAILED/PENDING
 * distinctly in the UI and stay in the right state while retries happen.
 */
export type EmailEventStatus =
  | 'NONE'
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED';

export interface ComputeAppointeeStatusArgs {
  /** fellowshipAccepted custom field from CiviCRM */
  fellowshipAccepted: boolean;
  /** Match-ladder tier for this appointee from vit-id-match.ts */
  vitIdTier: VitIdStatus;
  /** Status of the VIT_ID_INVITATION email event, or 'NONE' if no row */
  vitIdInvitationStatus: EmailEventStatus;
  /** Status of the BIO_PROJECT_DESCRIPTION email event, or 'NONE' if no row */
  bioEmailStatus: EmailEventStatus;
}

/**
 * Pure function — derives the lifecycle state of an appointee from
 * four independent signals. No I/O, no side effects (apart from the
 * anomaly logger.warn, which is informational).
 *
 * Design doc: ~/.gstack/projects/villaitatti-profile-portal/acaselli-main-design-20260422-172624.md
 *
 * Transitions (simplified):
 *
 *   fellowshipAccepted=false  →  nominated
 *
 *   fellowshipAccepted=true
 *     + hasVitId + bioSent    →  enrolled       (terminal)
 *     + hasVitId              →  vit-id-claimed (Angela sends bio)
 *     + invitationSent        →  vit-id-sent    (waiting on appointee)
 *     + otherwise             →  accepted       (Angela sends invitation)
 *
 * Where hasVitId = (vitIdTier === 'active' || vitIdTier === 'active-different-email').
 * Both ladder tiers mean "this contact has an Auth0 account we are confident about" —
 * mirrors the existing bio-email eligibility in appointee-email.service.ts.
 *
 * needs-review rows: returned as whichever state the other signals imply,
 * with the front-end disabling the Send button until the match-ladder
 * conflict is resolved. Server-side send endpoints also refuse with
 * { reason: 'needs_review' } — defense in depth.
 */
export function computeAppointeeStatus(
  args: ComputeAppointeeStatusArgs
): AppointeeStatus {
  if (!args.fellowshipAccepted) return 'nominated';

  const hasVitId =
    args.vitIdTier === 'active' ||
    args.vitIdTier === 'active-different-email';
  const bioSent = args.bioEmailStatus === 'SENT';
  const invitationSent = args.vitIdInvitationStatus === 'SENT';

  // Terminal success: both gates cleared.
  if (hasVitId && bioSent) return 'enrolled';

  // Returning appointees already have a VIT ID when the fellowship is
  // accepted — they skip Accepted and VIT ID Sent entirely.
  if (hasVitId) return 'vit-id-claimed';

  // Anomaly guard: bio email marked SENT should never pre-date
  // hasVitId === true. If it does, either the cron ran against stale Auth0
  // data or the match-ladder tier degraded after the send (name-collision
  // appeared, etc.). Log it, surface the in-flight state, and let the next
  // dashboard refresh reconcile. Not expected in practice.
  if (bioSent) {
    logger.warn(
      {
        event: 'appointee_status_anomaly',
        vitIdTier: args.vitIdTier,
        bioEmailStatus: args.bioEmailStatus,
      },
      'bio_email_sent_without_active_vit_id — treating row as vit-id-sent pending ladder refresh'
    );
    return 'vit-id-sent';
  }

  // Only count the invitation as "sent" if it actually succeeded.
  // A FAILED event keeps the row in `accepted` so Angela can retry.
  if (invitationSent) return 'vit-id-sent';

  return 'accepted';
}
