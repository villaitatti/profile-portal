import { getFellowsWithContacts, getEmailsForContacts } from './civicrm.service.js';
import { listUsersByRole } from './auth0.service.js';
import {
  getEmailStatusForContacts,
  currentAndNextAcademicYears,
} from './appointee-email.service.js';
import { buildAuth0Maps, reconcile, type LadderFellow } from './vit-id-match.js';
import { computeAppointeeStatus, type EmailEventStatus } from './appointee-status.js';
import { academicYearLabelForFellowship } from '../utils/eligibility.js';
import { AppointeeEmailStatus, AppointeeEmailType } from '@prisma/client';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import type {
  BioEmailSummary,
  VitIdInvitationSummary,
  FellowDashboardEntry,
  FellowsDashboardResponse,
  VitIdStatus,
  MatchedVia,
  NeedsReviewReason,
} from '@itatti/shared';

/**
 * Map a persisted AppointeeEmailStatus to the UI pill state + ISO sent-at.
 * Shared by the bio-email and VIT-ID-invitation summaries since both use
 * the same pill vocabulary ('none' / 'pending' / 'sent' / 'failed').
 */
function toPillState(
  event:
    | { status: AppointeeEmailStatus; sentAt: Date | null }
    | undefined
): { status: 'none' | 'pending' | 'sent' | 'failed'; sentAt: string | null } {
  if (!event) return { status: 'none', sentAt: null };
  switch (event.status) {
    case AppointeeEmailStatus.SENT:
      return {
        status: 'sent',
        sentAt: event.sentAt ? event.sentAt.toISOString() : null,
      };
    case AppointeeEmailStatus.PENDING:
    case AppointeeEmailStatus.SENDING:
      return { status: 'pending', sentAt: null };
    case AppointeeEmailStatus.FAILED:
      return { status: 'failed', sentAt: null };
    case AppointeeEmailStatus.SKIPPED:
      // Treat SKIPPED as "none" — the target-year pick already accounts for
      // eligibility; the admin can re-send manually if appropriate.
      return { status: 'none', sentAt: null };
  }
}

/**
 * Event → EmailEventStatus bridge for computeAppointeeStatus. 'NONE' when
 * no event row exists for this (fellowshipId, emailType).
 */
function toEventStatus(
  event: { status: AppointeeEmailStatus } | undefined
): EmailEventStatus {
  return event ? event.status : 'NONE';
}

function buildBioEmailSummary(args: {
  hasVitId: boolean;
  needsReview: boolean;
  targetAcademicYear: string | null;
  event:
    | { status: AppointeeEmailStatus; sentAt: Date | null; academicYear: string; sendCount?: number }
    | undefined;
}): BioEmailSummary {
  const { hasVitId, needsReview, targetAcademicYear, event } = args;
  const pill = toPillState(event);

  // Manual-send button eligibility: VIT ID exists, a current/accepted-upcoming
  // target year exists, the email has not already been SENT or PENDING, and
  // the match ladder is not in needs-review (sending could deliver to the
  // wrong inbox until Angela resolves the ambiguity).
  const canManuallySend =
    hasVitId &&
    !needsReview &&
    targetAcademicYear !== null &&
    pill.status !== 'sent' &&
    pill.status !== 'pending';

  return {
    status: pill.status,
    sentAt: pill.sentAt,
    sendCount: event?.sendCount ?? 0,
    targetAcademicYear,
    canManuallySend,
  };
}

function buildVitIdInvitationSummary(args: {
  hasVitId: boolean;
  needsReview: boolean;
  fellowshipAccepted: boolean;
  targetAcademicYear: string | null;
  event:
    | { status: AppointeeEmailStatus; sentAt: Date | null; academicYear: string; sendCount?: number }
    | undefined;
}): VitIdInvitationSummary {
  const { hasVitId, needsReview, fellowshipAccepted, targetAcademicYear, event } =
    args;
  const pill = toPillState(event);

  // Inverted precondition vs bio: VIT invitation is meaningful ONLY when the
  // appointee does NOT yet have a VIT ID. Additional gates match bio:
  // needs-review suppresses the button; SENT/PENDING suppresses it; a target
  // academic year must exist; fellowship must be accepted.
  const canManuallySend =
    fellowshipAccepted &&
    !hasVitId &&
    !needsReview &&
    targetAcademicYear !== null &&
    pill.status !== 'sent' &&
    pill.status !== 'pending';

  return {
    status: pill.status,
    sentAt: pill.sentAt,
    sendCount: event?.sendCount ?? 0,
    targetAcademicYear,
    canManuallySend,
  };
}

// Academic-year label derivation lives in utils/eligibility.ts so the
// dashboard and the bio/VIT-invitation eligibility layer agree. An older
// local copy here used LOCAL getFullYear()/getMonth() and mis-labeled
// "2026-07-01" as "2025-2026" on any west-of-UTC host (Conductor
// workspaces, contractors outside Europe), which silently mis-routed
// email events. academicYearLabelForFellowship() uses UTC accessors for
// exactly that reason — see the comment on its definition.

export async function getFellowsDashboard(
  academicYear?: string
): Promise<FellowsDashboardResponse> {
  // Fetch CiviCRM fellows and Auth0 users in parallel
  const [civicrmFellows, auth0Users] = await Promise.all([
    getFellowsWithContacts(),
    listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID),
  ]);

  // Build the three Auth0 maps (email, civicrm_id, normalized-name) used by
  // the match ladder.
  const auth0Maps = buildAuth0Maps(auth0Users);

  // Resolve current + next academic-year labels once — used both for the
  // target-year lookup and the batched bio-email status fetch.
  const [currentAy, nextAy] = currentAndNextAcademicYears();

  // Deduplicate fellows by contactId (a fellow may have multiple fellowships).
  // Keep the LATEST-STARTING fellowship per contact for dashboard display, AND
  // track `fellowshipId` + `fellowshipAccepted` of that display row so we can
  // key email-event lookups and compute the lifecycle state below.
  const academicYearsSet = new Set<string>();
  const fellowsByContact = new Map<
    number,
    {
      entry: Omit<
        FellowDashboardEntry,
        | 'status'
        | 'accountCreatedAt'
        | 'civicrmIdStatus'
        | 'bioEmail'
        | 'vitIdInvitation'
        | 'appointeeStatus'
      >;
      latestStart: string;
      displayFellowshipId: number;
      displayFellowshipAccepted: boolean;
      hasCurrentFellowship: boolean;
      hasAcceptedUpcomingFellowship: boolean;
      // The fellowship id for each target-year slot. Email events are stored
      // keyed by the fellowship that OWNS that year's emails — not by the
      // display fellowship. A returning fellow with two overlapping rows
      // (e.g., a 2024-2025 current + a 2026-2027 upcoming) would otherwise
      // look up events against the display fellowship (latest start = 2026-
      // 2027) while the current-year bio email is stored under the 2024-
      // 2025 fellowship id. Keeping a per-slot id avoids that mismatch.
      currentFellowshipId: number | null;
      acceptedUpcomingFellowshipId: number | null;
    }
  >();

  for (const f of civicrmFellows) {
    // CiviCRMFellowship-shaped slice (function only reads startDate).
    // Keeps the dashboard's year-label and utils/eligibility's year-label
    // on the same UTC-safe codepath.
    const yearLabel = academicYearLabelForFellowship({
      id: f.fellowshipId,
      contactId: f.contactId,
      startDate: f.startDate,
      endDate: f.endDate,
    });
    academicYearsSet.add(yearLabel);

    // If filtering by academic year and this fellowship doesn't match, skip
    if (academicYear && yearLabel !== academicYear) continue;

    const existing = fellowsByContact.get(f.contactId);
    const isCurrent = yearLabel === currentAy;
    const isAcceptedUpcoming = yearLabel === nextAy && f.fellowshipAccepted === true;

    if (!existing) {
      fellowsByContact.set(f.contactId, {
        entry: {
          civicrmId: f.contactId,
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          imageUrl: f.imageUrl,
          appointment: f.appointment,
          fellowship: f.fellowship,
          fellowshipYear: yearLabel,
        },
        latestStart: f.startDate,
        displayFellowshipId: f.fellowshipId,
        displayFellowshipAccepted: f.fellowshipAccepted === true,
        hasCurrentFellowship: isCurrent,
        hasAcceptedUpcomingFellowship: isAcceptedUpcoming,
        currentFellowshipId: isCurrent ? f.fellowshipId : null,
        acceptedUpcomingFellowshipId: isAcceptedUpcoming ? f.fellowshipId : null,
      });
    } else {
      if (f.startDate > existing.latestStart) {
        existing.entry = {
          civicrmId: f.contactId,
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          imageUrl: f.imageUrl,
          appointment: f.appointment,
          fellowship: f.fellowship,
          fellowshipYear: yearLabel,
        };
        existing.latestStart = f.startDate;
        existing.displayFellowshipId = f.fellowshipId;
        existing.displayFellowshipAccepted = f.fellowshipAccepted === true;
      }
      if (isCurrent) {
        existing.hasCurrentFellowship = true;
        if (existing.currentFellowshipId === null) {
          existing.currentFellowshipId = f.fellowshipId;
        } else if (existing.currentFellowshipId !== f.fellowshipId) {
          logger.warn(
            {
              contactId: f.contactId,
              existingFellowshipId: existing.currentFellowshipId,
              newFellowshipId: f.fellowshipId,
              slot: 'current',
            },
            'duplicate slot assignment'
          );
        }
      }
      if (isAcceptedUpcoming) {
        existing.hasAcceptedUpcomingFellowship = true;
        if (existing.acceptedUpcomingFellowshipId === null) {
          existing.acceptedUpcomingFellowshipId = f.fellowshipId;
        } else if (existing.acceptedUpcomingFellowshipId !== f.fellowshipId) {
          logger.warn(
            {
              contactId: f.contactId,
              existingFellowshipId: existing.acceptedUpcomingFellowshipId,
              newFellowshipId: f.fellowshipId,
              slot: 'accepted-upcoming',
            },
            'duplicate slot assignment'
          );
        }
      }
    }
  }

  // Batched email-status lookup. Scope to ALL academic years in play so
  // past-year filters surface historical send data (codex finding #2,
  // 2026-04-23). Both BIO_PROJECT_DESCRIPTION and VIT_ID_INVITATION types
  // come back in one query; the caller bins them.
  const contactIds = Array.from(fellowsByContact.keys());
  const yearsInScope = Array.from(academicYearsSet);
  const [emailStatusMap, emailsByContact] = await Promise.all([
    getEmailStatusForContacts(contactIds, yearsInScope),
    getEmailsForContacts(contactIds),
  ]);

  // Build an email→contactIds index from Email.get results. When the same
  // email string appears on 2+ distinct CiviCRM contacts (a duplicate-contact
  // data bug), we surface the affected fellows as 'needs-review' with
  // reason 'duplicate-civicrm-contact' BEFORE running the match ladder —
  // otherwise reconcile() would happily pick whichever Auth0 user matched
  // the ambiguous email and route the bio email / "Send" button at a
  // potentially-wrong account.
  const contactsByEmail = new Map<string, Set<number>>();
  for (const [cid, emails] of emailsByContact.entries()) {
    const allEmails = [
      ...(emails.primary ? [emails.primary] : []),
      ...emails.secondaries,
    ];
    for (const e of allEmails) {
      const key = e.toLowerCase();
      const existing = contactsByEmail.get(key) ?? new Set<number>();
      existing.add(cid);
      contactsByEmail.set(key, existing);
    }
  }

  function hasCrossContactDuplicate(emails: {
    primary: string | null;
    secondaries: string[];
  } | undefined): boolean {
    if (!emails) return false;
    const all = [...(emails.primary ? [emails.primary] : []), ...emails.secondaries];
    return all.some((e) => {
      const collisions = contactsByEmail.get(e.toLowerCase());
      return collisions ? collisions.size > 1 : false;
    });
  }

  // Run the match ladder for each fellow and assemble lifecycle + email
  // summaries. All derived state (appointeeStatus, canManuallySend gates)
  // flows from the same three signals: ladder tier, fellowshipAccepted, and
  // persisted email-event rows.
  const fellows: FellowDashboardEntry[] = [];
  for (const item of fellowsByContact.values()) {
    const {
      entry,
      displayFellowshipAccepted,
      hasCurrentFellowship,
      hasAcceptedUpcomingFellowship,
      currentFellowshipId,
      acceptedUpcomingFellowshipId,
    } = item;

    const contactEmails = emailsByContact.get(entry.civicrmId);

    // Bio-email target year: prefer current, else accepted-upcoming (matches
    // the cron's eligibility window). For the VIT invitation preview we use
    // the same target — it's the year Angela is onboarding the fellow into.
    const targetAcademicYear = hasCurrentFellowship
      ? currentAy
      : hasAcceptedUpcomingFellowship
        ? nextAy
        : null;
    // The fellowship ID that is eligible for a manual send action. When a
    // returning fellow has both a current row and a later accepted-upcoming row,
    // the action target remains current-year so we do not accidentally surface
    // the future fellowship's email event as today's actionable lifecycle.
    const actionFellowshipId = hasCurrentFellowship
      ? currentFellowshipId
      : hasAcceptedUpcomingFellowship
        ? acceptedUpcomingFellowshipId
        : null;

    // Status display and send eligibility intentionally use different
    // fellowship IDs. In a filtered year, dedupe only sees rows from that year,
    // so displayFellowshipId is the correct historical lookup key. In the
    // all-years view, prefer the actionable current/upcoming fellowship, then
    // fall back to the display row for past-only fellows.
    const statusLookupFellowshipId = academicYear
      ? item.displayFellowshipId
      : actionFellowshipId ?? item.displayFellowshipId;

    // Look up latest event by (fellowshipId, emailType). The lookup key is
    // allowed to differ from the action key so historical filters can show
    // past send status while still keeping manual-send buttons gated to
    // current/accepted-upcoming fellowships.
    const bioEvent = statusLookupFellowshipId
      ? emailStatusMap.get(
          `${statusLookupFellowshipId}:${AppointeeEmailType.BIO_PROJECT_DESCRIPTION}`
        )
      : undefined;
    const vitInvitationEvent = statusLookupFellowshipId
      ? emailStatusMap.get(
          `${statusLookupFellowshipId}:${AppointeeEmailType.VIT_ID_INVITATION}`
        )
      : undefined;

    // Pre-flight: if any of this fellow's emails is shared across multiple
    // CiviCRM contacts, short-circuit to 'needs-review' with
    // 'duplicate-civicrm-contact'. Bypasses the ladder entirely so we don't
    // pick an arbitrary Auth0 user based on an ambiguous email.
    if (hasCrossContactDuplicate(contactEmails)) {
      const bioEmail = buildBioEmailSummary({
        // reconcile() is bypassed for duplicate-contact rows, so no matched
        // Auth0/VIT user is known; treat the account as unclaimed.
        hasVitId: false,
        needsReview: true,
        targetAcademicYear,
        event: bioEvent,
      });
      const vitIdInvitation = buildVitIdInvitationSummary({
        hasVitId: false,
        needsReview: true,
        fellowshipAccepted: displayFellowshipAccepted,
        targetAcademicYear,
        event: vitInvitationEvent,
      });
      const base: FellowDashboardEntry = {
        ...entry,
        status: 'needs-review',
        reason: 'duplicate-civicrm-contact',
        candidates: [],
        civicrmIdStatus: 'n/a',
        bioEmail,
        vitIdInvitation,
        // Duplicate-contact rows still get an appointeeStatus derivation so
        // the chip column never shows blank. The needs-review state drives
        // the button disabling, not the chip itself.
        appointeeStatus: computeAppointeeStatus({
          fellowshipAccepted: displayFellowshipAccepted,
          vitIdTier: 'needs-review',
          vitIdInvitationStatus: toEventStatus(vitInvitationEvent),
          bioEmailStatus: toEventStatus(bioEvent),
        }),
      };
      fellows.push(base);
      continue;
    }

    const ladderFellow: LadderFellow = {
      civicrmId: entry.civicrmId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      // Use the Email-entity primary. If Email.get returned no rows for this
      // contact (e.g., every email is on_hold), pass null — the ladder skips
      // tier 1 and proceeds to civicrm_id. Deliberate: falling back to the
      // fellow-list row's email_primary.email would match against on_hold
      // addresses that Email.get excluded on purpose.
      primaryEmail: contactEmails?.primary ?? null,
      secondaries: contactEmails?.secondaries ?? [],
    };

    const match = reconcile(ladderFellow, auth0Maps);

    // For the legacy `civicrmIdStatus` integrity flag, we mirror the previous
    // behavior: 'ok' when the matched Auth0 user has civicrm_id in metadata,
    // 'missing' when matched but metadata absent, 'n/a' otherwise.
    const matchedUser =
      match.status === 'active' || match.status === 'active-different-email'
        ? match.matched
        : null;
    const civicrmIdStatus = !matchedUser
      ? ('n/a' as const)
      : matchedUser.civicrmId
        ? ('ok' as const)
        : ('missing' as const);

    const hasVitId = !!matchedUser;
    const isNeedsReview = match.status === 'needs-review';

    const bioEmail = buildBioEmailSummary({
      hasVitId,
      needsReview: isNeedsReview,
      targetAcademicYear,
      event: bioEvent,
    });

    const vitIdInvitation = buildVitIdInvitationSummary({
      hasVitId,
      needsReview: isNeedsReview,
      fellowshipAccepted: displayFellowshipAccepted,
      targetAcademicYear,
      event: vitInvitationEvent,
    });

    const appointeeStatus = computeAppointeeStatus({
      fellowshipAccepted: displayFellowshipAccepted,
      vitIdTier: match.status,
      vitIdInvitationStatus: toEventStatus(vitInvitationEvent),
      bioEmailStatus: toEventStatus(bioEvent),
    });

    const base: FellowDashboardEntry = {
      ...entry,
      status: match.status,
      civicrmIdStatus,
      bioEmail,
      vitIdInvitation,
      appointeeStatus,
    };

    if (match.status === 'active' || match.status === 'active-different-email') {
      base.matchedVia = match.matchedVia;
      base.matched = match.matched;
      if (match.status === 'active-different-email' && match.matchedViaEmail) {
        base.matchedViaEmail = match.matchedViaEmail;
      }
    } else if (match.status === 'needs-review') {
      base.reason = match.reason;
      base.candidates = match.candidates;
    }

    fellows.push(base);
  }

  // Observability: emit structured counts so we can see in 3 months whether
  // tier 3 / tier 4 fire often enough to have justified the extra CiviCRM
  // call, and whether any conflict reasons are surfacing data bugs.
  emitMatchSummaryLog(fellows, academicYear);

  // Sort: appointment asc → lastName asc. Groups Fellows together,
  // Visiting Professors together, etc., then alphabetical within each group.
  // Attention is surfaced via the amber/red badges, not via sort position.
  fellows.sort((a, b) => {
    const apptCmp = (a.appointment || '').localeCompare(b.appointment || '');
    if (apptCmp !== 0) return apptCmp;
    return a.lastName.localeCompare(b.lastName);
  });

  // Sort academic years descending
  const academicYears = Array.from(academicYearsSet).sort().reverse();

  return {
    fellows,
    academicYears,
    summary: {
      total: fellows.length,
      noAccount: fellows.filter((f) => f.status === 'no-account').length,
      active: fellows.filter((f) => f.status === 'active').length,
      activeDifferentEmail: fellows.filter((f) => f.status === 'active-different-email').length,
      needsReview: fellows.filter((f) => f.status === 'needs-review').length,
    },
  };
}

function emitMatchSummaryLog(
  fellows: FellowDashboardEntry[],
  academicYear: string | undefined
): void {
  const byStatus: Record<VitIdStatus, number> = {
    active: 0,
    'active-different-email': 0,
    'needs-review': 0,
    'no-account': 0,
  };
  const byMatchedVia: Record<MatchedVia, number> = {
    'primary-email': 0,
    'civicrm-id': 0,
    'secondary-email': 0,
    name: 0,
  };
  const byNeedsReviewReason: Record<NeedsReviewReason, number> = {
    'name-collision': 0,
    'tier-conflict': 0,
    'primary-conflict': 0,
    'duplicate-civicrm-contact': 0,
    'auth0-collision': 0,
  };

  for (const f of fellows) {
    byStatus[f.status]++;
    if (f.matchedVia) byMatchedVia[f.matchedVia]++;
    if (f.reason) byNeedsReviewReason[f.reason]++;
  }

  logger.info(
    {
      event: 'fellows_dashboard_match_summary',
      academicYear: academicYear ?? null,
      totalFellows: fellows.length,
      byStatus,
      byMatchedVia,
      byNeedsReviewReason,
    },
    'Fellows dashboard match summary'
  );
}
