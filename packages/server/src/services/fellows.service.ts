import { getFellowsWithContacts, getEmailsForContacts } from './civicrm.service.js';
import { listUsersByRole } from './auth0.service.js';
import {
  getEmailStatusForContacts,
  currentAndNextAcademicYears,
} from './appointee-email.service.js';
import { buildAuth0Maps, reconcile, type LadderFellow } from './vit-id-match.js';
import { AppointeeEmailStatus } from '@prisma/client';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import type {
  BioEmailSummary,
  FellowDashboardEntry,
  FellowsDashboardResponse,
  VitIdStatus,
  MatchedVia,
  NeedsReviewReason,
} from '@itatti/shared';

function buildBioEmailSummary(args: {
  hasVitId: boolean;
  targetAcademicYear: string | null;
  event:
    | { status: AppointeeEmailStatus; sentAt: Date | null; academicYear: string }
    | undefined;
}): BioEmailSummary {
  const { hasVitId, targetAcademicYear, event } = args;

  // Map DB status → UI pill status.
  let pillStatus: BioEmailSummary['status'] = 'none';
  let sentAt: string | null = null;

  if (event) {
    switch (event.status) {
      case AppointeeEmailStatus.SENT:
        pillStatus = 'sent';
        sentAt = event.sentAt ? event.sentAt.toISOString() : null;
        break;
      case AppointeeEmailStatus.PENDING:
      case AppointeeEmailStatus.SENDING:
        pillStatus = 'pending';
        break;
      case AppointeeEmailStatus.FAILED:
        pillStatus = 'failed';
        break;
      case AppointeeEmailStatus.SKIPPED:
        // Treat SKIPPED as "none" in the UI — the target-year pick already
        // accounts for current/accepted-upcoming eligibility, and the admin
        // can re-send manually if appropriate.
        pillStatus = 'none';
        break;
    }
  }

  // Manual-send button eligibility: VIT ID exists, a current/accepted-upcoming
  // target year exists, and the email has not already been SENT.
  const canManuallySend =
    hasVitId && targetAcademicYear !== null && pillStatus !== 'sent' && pillStatus !== 'pending';

  return {
    status: pillStatus,
    sentAt,
    targetAcademicYear,
    canManuallySend,
  };
}

function getAcademicYearLabel(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  // If the fellowship spans across calendar years, use startYear-endYear
  if (startYear !== endYear) {
    return `${startYear}-${endYear}`;
  }

  // If within the same calendar year, determine based on month
  // July+ belongs to startYear-startYear+1, Jan-June belongs to startYear-1-startYear
  const month = start.getMonth();
  if (month >= 6) {
    return `${startYear}-${startYear + 1}`;
  }
  return `${startYear - 1}-${startYear}`;
}

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
  // Keep the most recent fellowship per contact for the dashboard display,
  // but ALSO record whether the contact has a current-year or an
  // accepted-upcoming fellowship — the manual "send bio email" button only
  // appears when one of those is true.
  const academicYearsSet = new Set<string>();
  const fellowsByContact = new Map<
    number,
    {
      entry: Omit<FellowDashboardEntry, 'status' | 'accountCreatedAt' | 'civicrmIdStatus' | 'bioEmail'>;
      latestStart: string;
      hasCurrentFellowship: boolean;
      hasAcceptedUpcomingFellowship: boolean;
    }
  >();

  for (const f of civicrmFellows) {
    const yearLabel = getAcademicYearLabel(f.startDate, f.endDate);
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
        hasCurrentFellowship: isCurrent,
        hasAcceptedUpcomingFellowship: isAcceptedUpcoming,
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
      }
      if (isCurrent) existing.hasCurrentFellowship = true;
      if (isAcceptedUpcoming) existing.hasAcceptedUpcomingFellowship = true;
    }
  }

  // Batched bio-email lookup — ONE query, even for 100+ fellows.
  const contactIds = Array.from(fellowsByContact.keys());
  const [bioEmailMap, emailsByContact] = await Promise.all([
    getEmailStatusForContacts(contactIds, [currentAy, nextAy]),
    getEmailsForContacts(contactIds),
  ]);

  // Run the match ladder for each fellow.
  const fellows: FellowDashboardEntry[] = [];
  for (const item of fellowsByContact.values()) {
    const { entry, hasCurrentFellowship, hasAcceptedUpcomingFellowship } = item;

    const contactEmails = emailsByContact.get(entry.civicrmId);
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

    // Bio-email target year: prefer current, else accepted-upcoming.
    const targetAcademicYear = hasCurrentFellowship
      ? currentAy
      : hasAcceptedUpcomingFellowship
        ? nextAy
        : null;

    const existingEvent = targetAcademicYear
      ? bioEmailMap.get(`${entry.civicrmId}:${targetAcademicYear}`)
      : undefined;

    const bioEmail = buildBioEmailSummary({
      // hasVitId is true when the ladder found any active match. For
      // 'needs-review' we deliberately return false — we won't send to an
      // ambiguous target.
      hasVitId: !!matchedUser,
      targetAcademicYear,
      event: existingEvent,
    });

    const base: FellowDashboardEntry = {
      ...entry,
      status: match.status,
      civicrmIdStatus,
      bioEmail,
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
