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

/**
 * True when a fellowship on its own justifies provisioning a VIT ID: it is in
 * the past or current, or it is upcoming and has been accepted.
 *
 * Rows whose CiviCRM dates don't parse are NOT qualifying. CiviCRM can return a
 * null start/end, which `civicrm.service` stringifies to "null" — that yields an
 * Invalid Date, and classifyFellowship's comparisons are all false for NaN, so
 * such a row fell through to 'upcoming' and counted as qualifying whenever
 * `fellowshipAccepted` happened to be true.
 */
function hasParseableDates(fellowship: CiviCRMFellowship): boolean {
  const start = stripTime(new Date(fellowship.startDate));
  const end = stripTime(new Date(fellowship.endDate));
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
}

function isQualifyingFellowship(
  fellowship: CiviCRMFellowship,
  referenceDate: Date
): boolean {
  if (!hasParseableDates(fellowship)) return false;

  const temporal = classifyFellowship(fellowship.startDate, fellowship.endDate, referenceDate);
  return temporal === 'past' || temporal === 'current' || !!fellowship.fellowshipAccepted;
}

export function evaluateEligibility(
  fellowships: CiviCRMFellowship[],
  referenceDate: Date = new Date()
): EligibilityResult {
  if (fellowships.length === 0) {
    return { eligible: false, reason: 'no_fellowship_records' };
  }

  // Multiple fellowship records = eligible, but only if at least one of them
  // actually qualifies. The count alone used to be enough, which meant a contact
  // holding two nominated-but-declined future fellowships was auto-provisioned an
  // Auth0 account, the fellows role and JSM org membership — while the same
  // person with exactly one such row was correctly refused.
  if (fellowships.length > 1) {
    if (fellowships.some((f) => isQualifyingFellowship(f, referenceDate))) {
      return { eligible: true, reason: 'multiple_fellowships' };
    }
    return { eligible: false, reason: 'single_upcoming_not_accepted' };
  }

  // Single fellowship record. Reject unparseable dates first — the same rule
  // the multi-fellowship path applies via isQualifyingFellowship — so a lone row
  // with a null/"null" CiviCRM date can't fall through classifyFellowship to
  // 'upcoming' and provision an account off a garbage date.
  const fellowship = fellowships[0];
  if (!hasParseableDates(fellowship)) {
    return { eligible: false, reason: 'single_upcoming_not_accepted' };
  }
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
    academicYear: academicYearLabelForFellowship(chosen),
    fellowship: chosen,
  };
}

/**
 * Derive the "YYYY-YYYY" academic-year label for a fellowship. Academic years
 * at I Tatti run July 1 → June 30; a fellowship starting in July-December of
 * year Y belongs to year label "Y-(Y+1)", a fellowship starting January-June
 * of year Y belongs to "(Y-1)-Y".
 *
 * Uses UTC accessors so that a CiviCRM startDate of "2026-07-01" (parsed by
 * Date as midnight UTC) does not drift to June 30 23:00 when the server runs
 * in a west-of-UTC timezone, which would flip the label from "2026-2027" to
 * "2025-2026".
 */
export function academicYearLabelForFellowship(fellowship: CiviCRMFellowship): string {
  const start = new Date(fellowship.startDate);
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth(); // 0-indexed
  if (startMonth >= 6) return `${startYear}-${startYear + 1}`;
  return `${startYear - 1}-${startYear}`;
}

// Narrow the current-AY label for callers that want it alongside the target.
export function currentAcademicYearLabel(referenceDate: Date = new Date()): string {
  return getCurrentAcademicYear(referenceDate).label;
}
