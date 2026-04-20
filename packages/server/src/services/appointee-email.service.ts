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

export type BioEmailIneligibilityReason =
  | 'no_vit_id'
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'already_sent';

export type EligibilityEvaluation =
  | { eligible: true; email: string; firstName: string }
  | { eligible: false; reason: BioEmailIneligibilityReason };

interface EnqueueArgs {
  contactId: number;
  academicYear: string;
  triggeredBy: string;
  delayHours?: number;
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
  const { contactId, academicYear, triggeredBy, delayHours = 24 } = args;
  const now = new Date();
  const sendAfter = new Date(now.getTime() + delayHours * 60 * 60 * 1000);

  const existing = await prisma.appointeeEmailEvent.findUnique({
    where: {
      contactId_academicYear_emailType: {
        contactId,
        academicYear,
        emailType: AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
      },
    },
  });

  if (existing) {
    logger.info(
      { contactId, academicYear, existingStatus: existing.status, triggeredBy },
      'Bio email: existing event found, not enqueuing duplicate'
    );
    return { eventId: existing.id, status: existing.status, created: false };
  }

  // Race-safe create: another worker may have inserted the same
  // (contactId, academicYear, emailType) tuple after our findUnique but before
  // our create. Handle the resulting P2002 unique-constraint violation by
  // re-reading the row the winner inserted, returning created:false.
  try {
    const created = await prisma.appointeeEmailEvent.create({
      data: {
        contactId,
        academicYear,
        emailType: AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
        status: AppointeeEmailStatus.PENDING,
        sendAfter,
        triggeredBy,
      },
    });

    logger.info(
      { eventId: created.id, contactId, academicYear, sendAfter, triggeredBy },
      'Bio email: event enqueued'
    );

    return { eventId: created.id, status: created.status, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.appointeeEmailEvent.findUnique({
        where: {
          contactId_academicYear_emailType: {
            contactId,
            academicYear,
            emailType: AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
          },
        },
      });
      if (winner) {
        logger.info(
          { contactId, academicYear, winnerStatus: winner.status, triggeredBy },
          'Bio email: P2002 race lost, returning existing event'
        );
        return { eventId: winner.id, status: winner.status, created: false };
      }
      // P2002 without a re-fetched row is pathological — a row was deleted
      // between the constraint hit and the re-read. Fall through to re-throw.
    }
    throw err;
  }
}

/**
 * Re-evaluate eligibility at dispatch time with a fresh lookup:
 *   - contact must still exist in CiviCRM with a primary email
 *   - contact must have a VIT ID (Auth0 user by email) — we never email a JSM
 *     link to someone who can't authenticate
 *   - a current-year fellowship, OR an accepted upcoming-year fellowship,
 *     must still match the target academic year
 *
 * Returns the recipient email + firstName (falling back to the CiviCRM value;
 * the email template further falls back to "Appointee" if blank).
 */
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
  // to. Better to short-circuit with a clear reason than send a dead-end email.
  const auth0User = await auth0Service.findUserByEmail(contact.email);
  if (!auth0User) {
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
  const reclaimCutoff = new Date(now.getTime() - STALE_SENDING_THRESHOLD_MS);
  const reclaimResult = await prisma.appointeeEmailEvent.updateMany({
    where: {
      status: AppointeeEmailStatus.SENDING,
      updatedAt: { lt: reclaimCutoff },
    },
    data: { status: AppointeeEmailStatus.PENDING },
  });
  if (reclaimResult.count > 0) {
    logger.warn(
      { reclaimed: reclaimResult.count, thresholdMs: STALE_SENDING_THRESHOLD_MS },
      'Bio email: reclaimed stale SENDING rows back to PENDING (worker likely crashed mid-dispatch)'
    );
  }

  const due = await prisma.appointeeEmailEvent.findMany({
    where: {
      status: AppointeeEmailStatus.PENDING,
      sendAfter: { lte: now },
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

  // Re-evaluate eligibility (contact may have changed since enqueue).
  let eligibility: EligibilityEvaluation;
  try {
    eligibility = await evaluateBioEmailEligibility(event.contactId, event.academicYear);
  } catch (err) {
    // Upstream failure (CiviCRM down). Leave as deferred — revert to PENDING.
    await prisma.appointeeEmailEvent.update({
      where: { id: eventId },
      data: { status: AppointeeEmailStatus.PENDING },
    });
    logger.warn(
      { err, eventId, contactId: event.contactId },
      'Bio email: eligibility check failed, deferring to next run'
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
      { eventId, reason: eligibility.reason },
      'Bio email: eligibility lost, skipping'
    );
    return 'skipped';
  }

  try {
    const { messageId } = await emailService.sendBioProjectDescriptionEmail({
      to: eligibility.email,
      firstName: eligibility.firstName,
    });

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
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.appointeeEmailEvent.update({
      where: { id: eventId },
      data: {
        status: AppointeeEmailStatus.FAILED,
        failureReason: reason.slice(0, 500),
      },
    });
    logger.error({ err, eventId }, 'Bio email: SES send failed');
    return 'failed';
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
      contactId_academicYear_emailType: {
        contactId,
        academicYear,
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
    triggeredBy,
    delayHours: 0,
  });

  const outcome = await dispatchOne(eventId);
  const finalEvent = await prisma.appointeeEmailEvent.findUniqueOrThrow({
    where: { id: eventId },
  });

  // Upstream failure: event stayed PENDING. Surface a 500-ish signal to the
  // route layer (we don't leak the underlying error to the admin).
  if (outcome === 'deferred') {
    throw new Error('upstream_fetch_failed');
  }

  return {
    ok: true,
    eventId: finalEvent.id,
    status: finalEvent.status,
    sentAt: finalEvent.sentAt,
  };
}

/**
 * Batched lookup for the Fellows Management dashboard. Given N contacts and
 * the [current, next] academic-year labels, returns a Map keyed by
 * `${contactId}:${academicYear}` → {status, sentAt, academicYear}.
 *
 * Always use this instead of per-row queries to avoid the N+1 problem.
 */
export async function getEmailStatusForContacts(
  contactIds: number[],
  academicYears: string[]
): Promise<
  Map<string, { status: AppointeeEmailStatus; sentAt: Date | null; academicYear: string }>
> {
  const result = new Map<
    string,
    { status: AppointeeEmailStatus; sentAt: Date | null; academicYear: string }
  >();
  if (contactIds.length === 0 || academicYears.length === 0) return result;

  const rows = await prisma.appointeeEmailEvent.findMany({
    where: {
      emailType: AppointeeEmailType.BIO_PROJECT_DESCRIPTION,
      contactId: { in: contactIds },
      academicYear: { in: academicYears },
    },
    select: {
      contactId: true,
      academicYear: true,
      status: true,
      sentAt: true,
    },
  });

  for (const row of rows) {
    result.set(`${row.contactId}:${row.academicYear}`, {
      status: row.status,
      sentAt: row.sentAt,
      academicYear: row.academicYear,
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
