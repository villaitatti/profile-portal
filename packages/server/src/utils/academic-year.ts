export interface AcademicYear {
  start: Date;
  end: Date;
  label: string;
}

/**
 * All date math in this module uses UTC accessors.
 *
 * CiviCRM date strings such as "2026-07-01" are parsed by `Date` as midnight
 * UTC. Reading them back with local accessors on a west-of-UTC host yields June
 * 30, which flips the academic-year label from "2026-2027" to "2025-2026" and
 * shifts every fellowship boundary by a day — so a fellowship classified
 * 'current' in the container is 'upcoming' on a developer's machine.
 * `eligibility.ts` already standardised on UTC for exactly this reason; these
 * two must agree or `classifyFellowship` and the year label disagree around
 * July 1.
 *
 * The production container runs without a TZ set (i.e. UTC), so this is a
 * correctness fix for every other environment: Conductor workspaces, laptops,
 * and CI runners outside UTC.
 */
export function getCurrentAcademicYear(referenceDate: Date = new Date()): AcademicYear {
  const month = referenceDate.getUTCMonth(); // 0-indexed (6 = July)
  const year = referenceDate.getUTCFullYear();

  // If July-December, academic year started this calendar year
  // If January-June, academic year started previous calendar year
  const startYear = month >= 6 ? year : year - 1;
  const endYear = startYear + 1;

  return {
    start: new Date(Date.UTC(startYear, 6, 1)), // July 1
    end: new Date(Date.UTC(endYear, 5, 30)), // June 30
    label: `${startYear}-${endYear}`,
  };
}

export function stripTime(date: Date): Date {
  if (Number.isNaN(date.getTime())) return date;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
