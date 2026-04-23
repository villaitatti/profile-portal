import { Prisma, AppointeeEmailStatus, AppointeeEmailType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import {
  classifyFellowship,
  pickBioEmailTargetYear,
  academicYearLabelForFellowship,
} from '../utils/eligibility.js';
import { getCurrentAcademicYear } from '../utils/academic-year.js';
import * as civicrmService from './civicrm.service.js';
import * as auth0Service from './auth0.service.js';
import * as emailService from './email.service.js';
import { buildAuth0Maps, reconcile, type LadderFellow } from './vit-id-match.js';
import { env } from '../env.js';

export type BioEmailIneligibilityReason =
  | 'no_vit_id'
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'already_sent';

/**
 * Reasons the VIT ID invitation send endpoint rejects a request. Overlaps
 * with bio-email reasons where the underlying checks are identical
 * (no_matching_fellowship, fellowship_not_accepted, no_primary_email,
 * already_sent) but adds its own specifics:
 *
 *   - missing_first_name: template render throws without a first name
 *   - already_has_vit_id: invitation would be misleading — they can sign in already
 *   - needs_review: match ladder returned an ambiguous result; Angela must resolve first
 *   - civicrm_unavailable: upstream fetch failed at validation time
 */
export type VitIdInvitationIneligibilityReason =
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'missing_first_name'
  | 'already_has_vit_id'
  | 'needs_review'
  | 'already_sent'
  | 'civicrm_unavailable';

export type EligibilityEvaluation =
  | { eligible: true; email: string; firstName: string; fellowshipId: number }
  | { eligible: false; reason: BioEmailIneligibilityReason };

export type VitIdInvitationEligibilityEvaluation =
  | { eligible: true; email: string; firstName: string; fellowshipId: number }
  | { eligible: false; reason: VitIdInvitationIneligibilityReason };

interface EnqueueArgs {
  contactId: number;
  academicYear: string;
  fellowshipId: number;
  triggeredBy: string;
  delayHours?: number;
  emailType?: AppointeeEmailType; // defaults to BIO_PROJECT_DESCRIPTION for back-compat
}

/**
 * Idempotently enqueue a bio-email event for (contactId, academicYear). If an
 * event already exists we leave it alone; a SENT event is already delivered,
 * a PENDING/SENDING event is already scheduled, and a FAILED event should be
 * retried via the manual admin path (which deletes the old row first).
 *
 * `sendAfter` is always "now + delayHours" (default 24h for the auto path,
 * pass 0 for the manual path).
 */
export async function enqueueBioEmail(args: EnqueueArgs): Promise<{
  eventId: string;
  status: AppointeeEmailStatus;
  created: boolean;
}> {
  return enqueueAppointeeEmail({
    ...args,
    emailType: args.emailType ?? AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
  });
}

/**
 * Generic event-queue primitive for any appointee-facing email type.
 * Race-safe: P2002 on (fellowshipId, emailType) is treated as "another
 * worker got there first", and the winner's row is returned to the caller.
 */
export async function enqueueAppointeeEmail(args: {
  contactId: number;
  academicYear: string;
  fellowshipId: number;
  triggeredBy: string;
  delayHours?: number;
  emailType: AppointeeEmailType;
}): Promise<{
  eventId: string;
  status: AppointeeEmailStatus;
  created: boolean;
}> {
  const {
    contactId,
    academicYear,
    fellowshipId,
    triggeredBy,
    delayHours = 24,
    emailType,
  } = args;
  const now = new Date();
  const sendAfter = new Date(now.getTime() + delayHours * 60 * 60 * 1000);

  const existing = await prisma.appointeeEmailEvent.findUnique({
    where: {
      fellowshipId_emailType: { fellowshipId, emailType },
    },
  });

  if (existing) {
    logger.info(
      {
        fellowshipId,
        contactId,
        academicYear,
        emailType,
        existingStatus: existing.status,
        triggeredBy,
      },
      'Appointee email: existing event found, not enqueuing duplicate'
    );
    return { eventId: existing.id, status: existing.status, created: false };
  }

  try {
    const created = await prisma.appointeeEmailEvent.create({
      data: {
        fellowshipId,
        contactId,
        academicYear,
        emailType,
        status: AppointeeEmailStatus.PENDING,
        sendAfter,
        triggeredBy,
      },
    });

    logger.info(
      {
        eventId: created.id,
        fellowshipId,
        contactId,
        academicYear,
        emailType,
        sendAfter,
        triggeredBy,
      },
      'Appointee email: event enqueued'
    );

    return { eventId: created.id, status: created.status, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.appointeeEmailEvent.findUnique({
        where: {
          fellowshipId_emailType: { fellowshipId, emailType },
        },
      });
      if (winner) {
        logger.info(
          {
            fellowshipId,
            contactId,
            academicYear,
            emailType,
            winnerStatus: winner.status,
            triggeredBy,
          },
          'Appointee email: P2002 race lost, returning existing event'
        );
        return { eventId: winner.id, status: winner.status, created: false };
      }
    }
    throw err;
  }
}

/**
 * Re-evaluate eligibility at dispatch time with a fresh lookup:
 *   - contact must still exist in CiviCRM with a primary email
 *   - contact must have a VIT ID reachable via the full match ladder
 *     (primary-email → civicrm_id → secondary-email → name). We intentionally
 *     accept "changed-email" matches: a fellow whose CiviCRM primary email
 *     changed since they claimed their VIT ID still gets the bio email at
 *     their current primary, because the ladder can prove they have an
 *     account to log into. We never email a JSM link to someone who can't
 *     authenticate, and we refuse to send on 'needs-review' outcomes.
 *   - a current-year fellowship, OR an accepted upcoming-year fellowship,
 *     must still match the target academic year
 *
 * Returns the recipient email + firstName (falling back to the CiviCRM value;
 * the email template further falls back to "Appointee" if blank).
 */
/**
 * Returns true when the CiviCRM contact has a VIT ID that the match ladder
 * resolves to unambiguously (i.e., `'active'` or `'active-different-email'`).
 * Returns false for `'needs-review'` (we won't send to an ambiguous target)
 * and for `'no-account'`.
 */
async function checkHasVitIdViaLadder(
  contactId: number,
  contact: { firstName: string; lastName: string; email: string }
): Promise<boolean> {
  const [auth0Users, contactEmails] = await Promise.all([
    auth0Service.listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID),
    civicrmService.getEmailsForContacts([contactId]),
  ]);
  const maps = buildAuth0Maps(auth0Users);
  const emails = contactEmails.get(contactId);
  const ladderFellow: LadderFellow = {
    civicrmId: contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    // No fallback to contact.email — if Email.get returned nothing for this
    // contact (all on_hold), we don't want to match against the held primary.
    primaryEmail: emails?.primary ?? null,
    secondaries: emails?.secondaries ?? [],
  };
  const match = reconcile(ladderFellow, maps);
  return match.status === 'active' || match.status === 'active-different-email';
}

export async function evaluateBioEmailEligibility(
  contactId: number,
  academicYear: string
): Promise<EligibilityEvaluation> {
  const contact = await civicrmService.getContactById(contactId);
  if (!contact) {
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  if (!contact.email) {
    return { eligible: false, reason: 'no_primary_email' };
  }

  // Backend policy mirrors the UI rule in fellows.service.ts: no Auth0 user =>
  // no VIT ID => bio email would link to a JSM form the contact can't log in
  // to. Use the match ladder (primary-email → civicrm_id → secondary-email →
  // name) so a returning fellow with a changed email still resolves to their
  // existing VIT ID rather than getting a false 'no_vit_id'. For
  // 'needs-review' we refuse to send — we won't pick a candidate to deliver to.
  const hasVitId = await checkHasVitIdViaLadder(contactId, contact);
  if (!hasVitId) {
    return { eligible: false, reason: 'no_vit_id' };
  }

  const fellowships = await civicrmService.getFellowships(contactId);
  if (fellowships.length === 0) {
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  // Does ANY fellowship match the target academic year?
  const matching = fellowships.filter(
    (f) => academicYearLabelForFellowship(f) === academicYear
  );
  if (matching.length === 0) {
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  // Fellowship must be current OR an accepted upcoming fellowship. Past-year
  // fellowships never receive a bio email.
  const eligibleFellowship = matching.find((f) => {
    const temporal = classifyFellowship(f.startDate, f.endDate);
    if (temporal === 'current') return true;
    if (temporal === 'upcoming' && f.fellowshipAccepted) return true;
    return false;
  });

  if (!eligibleFellowship) {
    const hasUpcomingNotAccepted = matching.some(
      (f) => classifyFellowship(f.startDate, f.endDate) === 'upcoming' && !f.fellowshipAccepted
    );
    if (hasUpcomingNotAccepted) {
      return { eligible: false, reason: 'fellowship_not_accepted' };
    }
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  return {
    eligible: true,
    email: contact.email,
    firstName: contact.firstName,
    fellowshipId: eligibleFellowship.id,
  };
}

/**
 * Check the match-ladder match status for a contact. Returns the full
 * FellowMatch so callers can distinguish needs-review (refuse politely)
 * from no-account (VIT invitation is appropriate).
 */
async function classifyLadderMatch(
  contactId: number,
  contact: { firstName: string; lastName: string; email: string }
) {
  const [auth0Users, contactEmails] = await Promise.all([
    auth0Service.listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID),
    civicrmService.getEmailsForContacts([contactId]),
  ]);
  const maps = buildAuth0Maps(auth0Users);
  const emails = contactEmails.get(contactId);
  const ladderFellow: LadderFellow = {
    civicrmId: contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    primaryEmail: emails?.primary ?? null,
    secondaries: emails?.secondaries ?? [],
  };
  return reconcile(ladderFellow, maps);
}

/**
 * Eligibility for the VIT ID invitation email. Mirrors the bio-email
 * eligibility check but with INVERTED VIT-ID semantics:
 *   - bio requires that a VIT ID ALREADY exists
 *   - VIT invitation requires that a VIT ID does NOT yet exist
 *
 * Other invariants are the same: CiviCRM contact must exist with a primary
 * email, the targeted academic year must correspond to an accepted fellowship
 * that is either current or upcoming, and upstream CiviCRM/Auth0 fetches must
 * succeed (otherwise the caller re-tries later).
 *
 * Separate from bio because the error-reason union + CTA semantics differ.
 */
export async function evaluateVitIdInvitationEligibility(
  contactId: number,
  academicYear: string
): Promise<VitIdInvitationEligibilityEvaluation> {
  let contact: Awaited<ReturnType<typeof civicrmService.getContactById>>;
  try {
    contact = await civicrmService.getContactById(contactId);
  } catch {
    return { eligible: false, reason: 'civicrm_unavailable' };
  }

  if (!contact) {
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  if (!contact.firstName || contact.firstName.trim().length === 0) {
    return { eligible: false, reason: 'missing_first_name' };
  }

  if (!contact.email) {
    return { eligible: false, reason: 'no_primary_email' };
  }

  let match;
  try {
    match = await classifyLadderMatch(contactId, contact);
  } catch {
    return { eligible: false, reason: 'civicrm_unavailable' };
  }

  if (match.status === 'needs-review') {
    return { eligible: false, reason: 'needs_review' };
  }
  // hasVitId check: if the ladder found an account (active OR
  // active-different-email), the invitation would be misleading — they
  // can already sign in. Bio email is the appropriate follow-up.
  if (match.status === 'active' || match.status === 'active-different-email') {
    return { eligible: false, reason: 'already_has_vit_id' };
  }

  let fellowships;
  try {
    fellowships = await civicrmService.getFellowships(contactId);
  } catch {
    return { eligible: false, reason: 'civicrm_unavailable' };
  }

  const matching = fellowships.filter(
    (f) => academicYearLabelForFellowship(f) === academicYear
  );
  if (matching.length === 0) {
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  // Fellowship must be accepted AND current-or-upcoming. Rejecting past
  // fellowships covers the operator-error case (Angela accidentally selects
  // last year's cohort).
  const eligibleFellowship = matching.find((f) => {
    if (!f.fellowshipAccepted) return false;
    const temporal = classifyFellowship(f.startDate, f.endDate);
    return temporal === 'current' || temporal === 'upcoming';
  });

  if (!eligibleFellowship) {
    const hasUnacceptedMatch = matching.some(
      (f) => !f.fellowshipAccepted
    );
    if (hasUnacceptedMatch) {
      return { eligible: false, reason: 'fellowship_not_accepted' };
    }
    return { eligible: false, reason: 'no_matching_fellowship' };
  }

  return {
    eligible: true,
    email: contact.email,
    firstName: contact.firstName,
    fellowshipId: eligibleFellowship.id,
  };
}

// Rows stuck in SENDING longer than this are treated as abandoned (process
// crashed between the atomic flip and the final status write) and reverted to
// PENDING at the top of the next dispatch run. Generously larger than any
// realistic single-event dispatch latency (SES + DB updates ≈ seconds).
const STALE_SENDING_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Dispatches all bio emails whose sendAfter <= now and status is PENDING.
 * Uses an atomic UPDATE …PENDING→SENDING with affectedRows=1 gate so that a
 * concurrent cron + manual dispatch cannot double-send (C1 decision in the
 * design doc).
 *
 * Before scanning PENDING rows, reclaims any abandoned SENDING rows (older
 * than STALE_SENDING_THRESHOLD_MS) by reverting them to PENDING. This unsticks
 * rows where a previous process crashed between the atomic flip and the
 * terminal status write; without this, such rows would be invisible to the
 * admin UI (manual button reports "in flight" forever).
 *
 * On upstream (CiviCRM/Auth0) fetch failure we leave the row PENDING and log
 * a warning so the next run retries. Only SES-level rejections mark FAILED.
 */
export async function dispatchPendingEmails(opts?: {
  now?: Date;
  limit?: number;
}): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  deferred: number;
  reclaimed: number;
}> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 100;

  // Stale-claim recovery. Uses updatedAt (Prisma @updatedAt) which is bumped
  // every time we transition a row, so a row sitting at SENDING for > 1h
  // must have crashed mid-dispatch.
  //
  // CRITICAL: exclude rows where sesMessageId is already set. Those rows
  // reached SES successfully but the follow-up "mark SENT" DB write failed
  // (see dispatchOne's split try/catch below). Reclaiming such a row would
  // send a second copy of the same email to the appointee.
  const reclaimCutoff = new Date(now.getTime() - STALE_SENDING_THRESHOLD_MS);
  const reclaimResult = await prisma.appointeeEmailEvent.updateMany({
    where: {
      status: AppointeeEmailStatus.SENDING,
      updatedAt: { lt: reclaimCutoff },
      sesMessageId: null,
    },
    data: { status: AppointeeEmailStatus.PENDING },
  });
  if (reclaimResult.count > 0) {
    logger.warn(
      { reclaimed: reclaimResult.count, thresholdMs: STALE_SENDING_THRESHOLD_MS },
      'Bio email: reclaimed stale SENDING rows back to PENDING (worker likely crashed mid-dispatch)'
    );
  }

  // Cron dispatches bio emails only. VIT ID invitations are manual-only
  // (Angela clicks Send after reviewing each case) and must never be
  // auto-sent by the daily cron — the eligibility window is different and
  // the copy includes a CTA the sender should be consciously issuing.
  const due = await prisma.appointeeEmailEvent.findMany({
    where: {
      status: AppointeeEmailStatus.PENDING,
      sendAfter: { lte: now },
      emailType: AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
    },
    orderBy: { sendAfter: 'asc' },
    take: limit,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;

  for (const event of due) {
    const result = await dispatchOne(event.id);
    if (result === 'sent') sent++;
    else if (result === 'skipped') skipped++;
    else if (result === 'failed') failed++;
    else if (result === 'deferred') deferred++;
  }

  logger.info(
    { processed: due.length, sent, skipped, failed, deferred, reclaimed: reclaimResult.count },
    'Bio email: dispatch run complete'
  );

  return {
    processed: due.length,
    sent,
    skipped,
    failed,
    deferred,
    reclaimed: reclaimResult.count,
  };
}

/**
 * Dispatch exactly one event. Public so the admin manual-send route can call
 * it directly after enqueue(delayHours: 0) — same code path, same guarantees.
 */
export async function dispatchOne(
  eventId: string
): Promise<'sent' | 'skipped' | 'failed' | 'deferred' | 'not_claimed'> {
  // Atomic PENDING → SENDING. Only one worker wins.
  const claimed = await prisma.appointeeEmailEvent.updateMany({
    where: { id: eventId, status: AppointeeEmailStatus.PENDING },
    data: { status: AppointeeEmailStatus.SENDING },
  });

  if (claimed.count !== 1) {
    return 'not_claimed';
  }

  const event = await prisma.appointeeEmailEvent.findUniqueOrThrow({
    where: { id: eventId },
  });

  // Re-evaluate eligibility (contact may have changed since enqueue). Branch
  // on email type — bio and VIT invitation share the contact/year/fellowship
  // checks but have INVERTED VIT-ID preconditions.
  let eligibility:
    | { eligible: true; email: string; firstName: string; fellowshipId: number }
    | { eligible: false; reason: string };
  try {
    eligibility =
      event.emailType === AppointeeEmailType.VIT_ID_INVITATION
        ? await evaluateVitIdInvitationEligibility(event.contactId, event.academicYear)
        : await evaluateBioEmailEligibility(event.contactId, event.academicYear);
  } catch (err) {
    // Upstream failure (CiviCRM down). Leave as deferred — revert to PENDING.
    await prisma.appointeeEmailEvent.update({
      where: { id: eventId },
      data: { status: AppointeeEmailStatus.PENDING },
    });
    logger.warn(
      { err, eventId, emailType: event.emailType, contactId: event.contactId },
      'Appointee email: eligibility check failed, deferring to next run'
    );
    return 'deferred';
  }

  if (!eligibility.eligible) {
    await prisma.appointeeEmailEvent.update({
      where: { id: eventId },
      data: {
        status: AppointeeEmailStatus.SKIPPED,
        failureReason: eligibility.reason,
      },
    });
    logger.info(
      { eventId, emailType: event.emailType, reason: eligibility.reason },
      'Appointee email: eligibility lost, skipping'
    );
    return 'skipped';
  }

  // Step 1: hand the message to SES. A throw here means SES rejected the
  // send, so FAILED is the correct terminal state (admin can retry).
  let messageId: string | undefined;
  try {
    const result =
      event.emailType === AppointeeEmailType.VIT_ID_INVITATION
        ? await emailService.sendVitIdInvitationEmail({
            to: eligibility.email,
            firstName: eligibility.firstName,
          })
        : await emailService.sendBioProjectDescriptionEmail({
            to: eligibility.email,
            firstName: eligibility.firstName,
          });
    messageId = result.messageId;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.appointeeEmailEvent.update({
      where: { id: eventId },
      data: {
        status: AppointeeEmailStatus.FAILED,
        failureReason: reason.slice(0, 500),
      },
    });
    logger.error({ err, eventId, emailType: event.emailType }, 'Appointee email: SES send failed');
    return 'failed';
  }

  // Step 2: SES accepted the email. Persist success. If this DB write fails
  // we MUST NOT mark the event FAILED — the email is already in SES's pipeline
  // and marking FAILED would (a) mislead the admin, and (b) if the admin hits
  // retry, trigger a duplicate send. Similarly we must prevent the stale-
  // SENDING reclaim from re-enqueuing this row, which we do by recording
  // sesMessageId via a best-effort partial write (the reclaim query filters
  // it out).
  try {
    await prisma.appointeeEmailEvent.update({
      where: { id: eventId },
      data: {
        status: AppointeeEmailStatus.SENT,
        sentAt: new Date(),
        sesMessageId: messageId ?? null,
      },
    });

    logger.info(
      { eventId, contactId: event.contactId, academicYear: event.academicYear, messageId },
      'Bio email: sent'
    );
    return 'sent';
  } catch (err) {
    // Best-effort: store sesMessageId alone so stale-SENDING reclaim skips
    // this row (its WHERE clause excludes non-null sesMessageId). If that
    // also fails, the primary alert below gives operators what they need.
    if (messageId) {
      try {
        await prisma.appointeeEmailEvent.update({
          where: { id: eventId },
          data: { sesMessageId: messageId },
        });
      } catch (partialErr) {
        logger.error(
          { err: partialErr, eventId, messageId },
          'Bio email: partial sesMessageId persistence also failed; row may be reclaimed'
        );
      }
    }
    logger.error(
      {
        err,
        eventId,
        contactId: event.contactId,
        academicYear: event.academicYear,
        sesMessageId: messageId,
      },
      'Bio email: CRITICAL — SES accepted email but status persistence failed; manual reconciliation required (check SES logs vs DB row)'
    );
    // The email did leave SES; report success to the caller so the admin
    // UI does not trigger a retry. Reconciliation happens via the log above.
    return 'sent';
  }
}

/**
 * Manual admin path: enqueue a fresh event (or replace a FAILED one) and
 * dispatch immediately. Returns the terminal status for the admin UI.
 *
 * Eligibility is checked BEFORE enqueue so Angela gets a clear
 * {reason} back instead of creating a SKIPPED event for a button press.
 */
export async function sendBioEmailManually(args: {
  contactId: number;
  academicYear: string;
  triggeredBy: string;
}): Promise<
  | { ok: true; eventId: string; status: AppointeeEmailStatus; sentAt: Date | null }
  | { ok: false; reason: BioEmailIneligibilityReason }
> {
  const { contactId, academicYear, triggeredBy } = args;

  // Pre-check eligibility so we don't persist a SKIPPED event on manual click.
  const eligibility = await evaluateBioEmailEligibility(contactId, academicYear);
  if (!eligibility.eligible) {
    return { ok: false, reason: eligibility.reason };
  }

  // Already-sent short-circuit (manual button is hidden in the UI once sent,
  // but guard at the API layer too).
  const existing = await prisma.appointeeEmailEvent.findUnique({
    where: {
      fellowshipId_emailType: {
        fellowshipId: eligibility.fellowshipId,
        emailType: AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
      },
    },
  });

  if (existing) {
    if (existing.status === AppointeeEmailStatus.SENT) {
      return { ok: false, reason: 'already_sent' };
    }
    if (
      existing.status === AppointeeEmailStatus.PENDING ||
      existing.status === AppointeeEmailStatus.SENDING
    ) {
      // In-flight: tell admin UI it's pending; don't create a duplicate.
      return {
        ok: true,
        eventId: existing.id,
        status: existing.status,
        sentAt: existing.sentAt,
      };
    }
    // FAILED or SKIPPED — delete and retry fresh.
    await prisma.appointeeEmailEvent.delete({ where: { id: existing.id } });
  }

  const { eventId } = await enqueueBioEmail({
    contactId,
    academicYear,
    fellowshipId: eligibility.fellowshipId,
    triggeredBy,
    delayHours: 0,
  });

  const outcome = await dispatchOne(eventId);

  // Upstream failure (CiviCRM/Auth0 unreachable): event stayed PENDING. Surface
  // a 500-ish signal to the route layer (we don't leak the underlying error
  // to the admin).
  if (outcome === 'deferred') {
    throw new Error('upstream_fetch_failed');
  }

  // SES rejected the send. The row is now FAILED. Throw so the route returns
  // a non-200 — otherwise the admin UI would show a green success toast
  // while the email never left the server.
  if (outcome === 'failed') {
    throw new Error('ses_send_failed');
  }

  const finalEvent = await prisma.appointeeEmailEvent.findUniqueOrThrow({
    where: { id: eventId },
  });

  // SKIPPED means eligibility flipped between the pre-check above and the
  // dispatch-time re-check (rare race). Map the persisted failureReason back
  // to an ineligibility reason the admin UI already knows how to render.
  // Anything that isn't a recognized reason falls through as a generic 500.
  if (outcome === 'skipped') {
    const reason = finalEvent.failureReason;
    const validReasons: readonly BioEmailIneligibilityReason[] = [
      'no_vit_id',
      'no_matching_fellowship',
      'fellowship_not_accepted',
      'no_primary_email',
      'already_sent',
    ];
    if (reason && (validReasons as readonly string[]).includes(reason)) {
      return { ok: false, reason: reason as BioEmailIneligibilityReason };
    }
    logger.warn(
      { eventId, failureReason: reason },
      'Bio email: dispatch returned skipped with unrecognized failureReason'
    );
    throw new Error('dispatch_skipped_unexpected');
  }

  // outcome === 'sent' (or 'not_claimed', which only happens if another worker
  // raced us on the same eventId — treat the persisted state as authoritative).
  return {
    ok: true,
    eventId: finalEvent.id,
    status: finalEvent.status,
    sentAt: finalEvent.sentAt,
  };
}

/**
 * Manual admin path for the VIT ID invitation email. Same shape and
 * idempotency guarantees as sendBioEmailManually, but:
 *   - preconditions are inverted (no existing VIT ID, not needs-review)
 *   - eligibility returns the richer VitIdInvitationIneligibilityReason union
 *   - cron does NOT pick up VIT_ID_INVITATION rows — this function is the
 *     only path that ever enqueues + dispatches one
 */
export async function sendVitIdInvitationManually(args: {
  contactId: number;
  academicYear: string;
  triggeredBy: string;
}): Promise<
  | { ok: true; eventId: string; status: AppointeeEmailStatus; sentAt: Date | null }
  | { ok: false; reason: VitIdInvitationIneligibilityReason }
> {
  const { contactId, academicYear, triggeredBy } = args;

  const eligibility = await evaluateVitIdInvitationEligibility(contactId, academicYear);
  if (!eligibility.eligible) {
    return { ok: false, reason: eligibility.reason };
  }

  const existing = await prisma.appointeeEmailEvent.findUnique({
    where: {
      fellowshipId_emailType: {
        fellowshipId: eligibility.fellowshipId,
        emailType: AppointeeEmailType.VIT_ID_INVITATION,
      },
    },
  });

  let eventId: string;
  if (existing) {
    if (existing.status === AppointeeEmailStatus.SENT) {
      return { ok: false, reason: 'already_sent' };
    }
    if (existing.status === AppointeeEmailStatus.SENDING) {
      // Another invocation is currently dispatching this row. Tell the admin
      // UI it's in-flight; don't duplicate.
      return {
        ok: true,
        eventId: existing.id,
        status: existing.status,
        sentAt: existing.sentAt,
      };
    }
    if (existing.status === AppointeeEmailStatus.PENDING) {
      // Unlike bio email, the cron NEVER dispatches VIT invitations. A
      // PENDING VIT row only exists if a previous manual send crashed
      // between enqueue and dispatch (or the stale-SENDING reclaim demoted
      // a previous SENDING row). Fall through to dispatchOne so the row
      // actually gets sent — short-circuiting with ok:true here would
      // strand the row forever since no cron picks it up.
      eventId = existing.id;
    } else {
      // FAILED or SKIPPED — delete and enqueue fresh so the caller sees a
      // clean dispatch (preserves the status-flip semantics of the
      // happy-path insert).
      await prisma.appointeeEmailEvent.delete({ where: { id: existing.id } });
      const enqueued = await enqueueAppointeeEmail({
        contactId,
        academicYear,
        fellowshipId: eligibility.fellowshipId,
        triggeredBy,
        delayHours: 0,
        emailType: AppointeeEmailType.VIT_ID_INVITATION,
      });
      eventId = enqueued.eventId;
    }
  } else {
    const enqueued = await enqueueAppointeeEmail({
      contactId,
      academicYear,
      fellowshipId: eligibility.fellowshipId,
      triggeredBy,
      delayHours: 0,
      emailType: AppointeeEmailType.VIT_ID_INVITATION,
    });
    eventId = enqueued.eventId;
  }

  const outcome = await dispatchOne(eventId);

  if (outcome === 'deferred') {
    throw new Error('upstream_fetch_failed');
  }
  if (outcome === 'failed') {
    throw new Error('ses_send_failed');
  }

  const finalEvent = await prisma.appointeeEmailEvent.findUniqueOrThrow({
    where: { id: eventId },
  });

  if (outcome === 'skipped') {
    const reason = finalEvent.failureReason;
    const validReasons: readonly VitIdInvitationIneligibilityReason[] = [
      'no_matching_fellowship',
      'fellowship_not_accepted',
      'no_primary_email',
      'missing_first_name',
      'already_has_vit_id',
      'needs_review',
      'already_sent',
      'civicrm_unavailable',
    ];
    if (reason && (validReasons as readonly string[]).includes(reason)) {
      return {
        ok: false,
        reason: reason as VitIdInvitationIneligibilityReason,
      };
    }
    logger.warn(
      { eventId, failureReason: reason },
      'VIT ID invitation: dispatch returned skipped with unrecognized failureReason'
    );
    throw new Error('dispatch_skipped_unexpected');
  }

  return {
    ok: true,
    eventId: finalEvent.id,
    status: finalEvent.status,
    sentAt: finalEvent.sentAt,
  };
}

/**
 * Batched lookup for the Fellows Management dashboard. One query returns
 * ALL email events across the given contacts, years, and types. Caller bins
 * the results by `emailType` into per-type maps.
 *
 * Key format: `${fellowshipId}:${emailType}`. This mirrors the database's
 * actual unique key on the events table (see migration 20260423120001 —
 * codex review 2026-04-23 moved the key from contactId+year to fellowshipId
 * because CiviCRM "one fellowship per contact per year" is policy, not a
 * schema constraint). Keying the in-memory Map the same way means two
 * fellowships for the same contact+year would surface as two independent
 * entries, not collapse into one. `fellowshipId` is also present on the
 * value payload so callers can double-check the binding.
 */
export async function getEmailStatusForContacts(
  contactIds: number[],
  academicYears: string[],
  emailTypes: AppointeeEmailType[] = [
    AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
    AppointeeEmailType.VIT_ID_INVITATION,
  ]
): Promise<
  Map<
    string,
    {
      status: AppointeeEmailStatus;
      sentAt: Date | null;
      academicYear: string;
      emailType: AppointeeEmailType;
      fellowshipId: number;
    }
  >
> {
  const result = new Map<
    string,
    {
      status: AppointeeEmailStatus;
      sentAt: Date | null;
      academicYear: string;
      emailType: AppointeeEmailType;
      fellowshipId: number;
    }
  >();
  if (
    contactIds.length === 0 ||
    academicYears.length === 0 ||
    emailTypes.length === 0
  )
    return result;

  const rows = await prisma.appointeeEmailEvent.findMany({
    where: {
      emailType: { in: emailTypes },
      contactId: { in: contactIds },
      academicYear: { in: academicYears },
    },
    select: {
      contactId: true,
      academicYear: true,
      status: true,
      sentAt: true,
      emailType: true,
      fellowshipId: true,
    },
  });

  for (const row of rows) {
    result.set(`${row.fellowshipId}:${row.emailType}`, {
      status: row.status,
      sentAt: row.sentAt,
      academicYear: row.academicYear,
      emailType: row.emailType,
      fellowshipId: row.fellowshipId,
    });
  }
  return result;
}

/**
 * Convenience: pick the academic-year label for a contact's current/upcoming
 * fellowship, using the shared helper. Returns null if neither exists.
 * Exposed here so callers don't need to import eligibility + CiviCRM directly.
 */
export async function getBioEmailTargetYearForContact(
  contactId: number
): Promise<{ academicYear: string } | null> {
  const fellowships = await civicrmService.getFellowships(contactId);
  const target = pickBioEmailTargetYear(fellowships);
  if (!target) return null;
  return { academicYear: target.academicYear };
}

// Exported for tests / dashboard summaries.
export function currentAndNextAcademicYears(now: Date = new Date()): [string, string] {
  const current = getCurrentAcademicYear(now);
  const [startStr, endStr] = current.label.split('-');
  const nextStart = Number(startStr) + 1;
  const nextEnd = Number(endStr) + 1;
  return [current.label, `${nextStart}-${nextEnd}`];
}

// Used as a Prisma alias in case we need to cast in tests.
export type AppointeeEmailEventDelegate = Prisma.AppointeeEmailEventDelegate;
