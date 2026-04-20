import { getFellowsWithContacts } from './civicrm.service.js';
import { listUsersByRole } from './auth0.service.js';
import {
  getEmailStatusForContacts,
  currentAndNextAcademicYears,
} from './appointee-email.service.js';
import { AppointeeEmailStatus } from '@prisma/client';
import { env } from '../env.js';
import type { BioEmailSummary, FellowDashboardEntry, FellowsDashboardResponse } from '@itatti/shared';

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

  // Build a lookup of Auth0 users by email (lowercase)
  const auth0ByEmail = new Map(
    auth0Users.map((u) => [u.email.toLowerCase(), u])
  );

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
  const bioEmailMap = await getEmailStatusForContacts(contactIds, [currentAy, nextAy]);

  // Merge with Auth0 data to determine status and civicrm_id check
  const fellows: FellowDashboardEntry[] = [];
  for (const item of fellowsByContact.values()) {
    const { entry, hasCurrentFellowship, hasAcceptedUpcomingFellowship } = item;
    const auth0User = entry.email ? auth0ByEmail.get(entry.email.toLowerCase()) : undefined;
    const status = auth0User ? 'active' : 'no-account';
    const civicrmIdStatus = !auth0User
      ? 'n/a' as const
      : auth0User.civicrmId
        ? 'ok' as const
        : 'missing' as const;

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
      hasVitId: !!auth0User,
      targetAcademicYear,
      event: existingEvent,
    });

    fellows.push({
      ...entry,
      status,
      civicrmIdStatus,
      bioEmail,
    });
  }

  // Sort: no-account first, then by last name
  fellows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'no-account' ? -1 : 1;
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
    },
  };
}
