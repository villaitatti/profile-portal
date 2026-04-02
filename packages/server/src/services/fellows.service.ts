import { getFellowsWithContacts } from './civicrm.service.js';
import { listUsersByRole } from './auth0.service.js';
import { env } from '../env.js';
import type { FellowDashboardEntry, FellowsDashboardResponse } from '@itatti/shared';

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

  // Deduplicate fellows by contactId (a fellow may have multiple fellowships).
  // Keep the most recent fellowship per contact for the dashboard.
  // Also collect all academic years.
  const academicYearsSet = new Set<string>();
  const fellowsByContact = new Map<
    number,
    { entry: Omit<FellowDashboardEntry, 'status' | 'accountCreatedAt'>; latestStart: string }
  >();

  for (const f of civicrmFellows) {
    const yearLabel = getAcademicYearLabel(f.startDate, f.endDate);
    academicYearsSet.add(yearLabel);

    // If filtering by academic year and this fellowship doesn't match, skip
    if (academicYear && yearLabel !== academicYear) continue;

    const existing = fellowsByContact.get(f.contactId);
    if (!existing || f.startDate > existing.latestStart) {
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
      });
    }
  }

  // Merge with Auth0 data to determine status
  const fellows: FellowDashboardEntry[] = [];
  for (const { entry } of fellowsByContact.values()) {
    const auth0User = entry.email ? auth0ByEmail.get(entry.email.toLowerCase()) : undefined;
    fellows.push({
      ...entry,
      status: auth0User ? 'active' : 'no-account',
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
