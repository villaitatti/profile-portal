import type { CiviCRMFellowship, FellowshipTemporal, EligibilityResult } from '@itatti/shared';
import { stripTime } from './academic-year.js';

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
