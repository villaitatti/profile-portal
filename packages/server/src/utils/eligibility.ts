import type { CiviCRMFellowship, FellowshipTemporal, EligibilityResult } from '@itatti/shared';
import { stripTime, getCurrentAcademicYear } from './academic-year.js';

export function classifyFellowship(
  startDate: string,
  endDate: string,
  referenceDate: Date = new Date()
): FellowshipTemporal {
  const today = stripTime(referenceDate);
  const start = stripTime(new Date(startDate));
  const end = stripTime(new Date(endDate));

  if (end < today) return 'past';
  if (start <= today && end >= today) return 'current';
  return 'upcoming';
}

export function evaluateEligibility(
  fellowships: CiviCRMFellowship[],
  referenceDate: Date = new Date()
): EligibilityResult {
  if (fellowships.length === 0) {
    return { eligible: false, reason: 'no_fellowship_records' };
  }

  // Multiple fellowship records = eligible (has fellowship history)
  if (fellowships.length > 1) {
    return { eligible: true, reason: 'multiple_fellowships' };
  }

  // Single fellowship record
  const fellowship = fellowships[0];
  const temporal = classifyFellowship(
    fellowship.startDate,
    fellowship.endDate,
    referenceDate
  );

  switch (temporal) {
    case 'past':
      return { eligible: true, reason: 'single_past_fellowship' };
    case 'current':
      return { eligible: true, reason: 'single_current_fellowship' };
    case 'upcoming':
      if (fellowship.fellowshipAccepted) {
        return { eligible: true, reason: 'single_upcoming_accepted' };
      }
      return { eligible: false, reason: 'single_upcoming_not_accepted' };
  }
}

/**
 * Returns the academic-year label of the fellowship that a bio-and-project
 * email should target for this contact: the current-year fellowship if one
 * exists, otherwise the upcoming-year one. Only "accepted" upcoming
 * fellowships count.
 *
 * Returns null when no current/upcoming-accepted fellowship exists.
 */
export function pickBioEmailTargetYear(
  fellowships: CiviCRMFellowship[],
  referenceDate: Date = new Date()
): { academicYear: string; fellowship: CiviCRMFellowship } | null {
  let current: CiviCRMFellowship | null = null;
  let upcoming: CiviCRMFellowship | null = null;

  for (const f of fellowships) {
    const temporal = classifyFellowship(f.startDate, f.endDate, referenceDate);
    if (temporal === 'current') {
      current = f;
    } else if (temporal === 'upcoming' && f.fellowshipAccepted) {
      // Pick the earliest-starting accepted upcoming fellowship.
      if (!upcoming || f.startDate < upcoming.startDate) upcoming = f;
    }
  }

  const chosen = current ?? upcoming;
  if (!chosen) return null;

  return {
    academicYear: academicYearLabelForFellowship(chosen, referenceDate),
    fellowship: chosen,
  };
}

/**
 * Derive the "YYYY-YYYY" academic-year label for a fellowship. Academic years
 * at I Tatti run July 1 → June 30; a fellowship starting in July-December of
 * year Y belongs to year label "Y-(Y+1)", a fellowship starting January-June
 * of year Y belongs to "(Y-1)-Y". Handles fellowships that straddle calendar
 * years by using the start month.
 */
export function academicYearLabelForFellowship(
  fellowship: CiviCRMFellowship,
  _referenceDate: Date = new Date()
): string {
  const start = new Date(fellowship.startDate);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth(); // 0-indexed
  if (startMonth >= 6) return `${startYear}-${startYear + 1}`;
  return `${startYear - 1}-${startYear}`;
}

// Narrow the current-AY label for callers that want it alongside the target.
export function currentAcademicYearLabel(referenceDate: Date = new Date()): string {
  return getCurrentAcademicYear(referenceDate).label;
}
