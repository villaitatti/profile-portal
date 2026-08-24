import { describe, it, expect } from 'vitest';
import { getCurrentAcademicYear, stripTime } from '../../utils/academic-year.js';

describe('getCurrentAcademicYear', () => {
  it('returns current calendar year as start when in July', () => {
    const result = getCurrentAcademicYear(new Date('2025-07-01'));
    expect(result.label).toBe('2025-2026');
    // UTC, not local. These assertions previously used `new Date(2025, 6, 1)`,
    // which is local midnight — on any host east of UTC that is 2025-06-30
    // 22:00Z, i.e. the academic year appeared to begin the day before July 1.
    // See the module comment in utils/academic-year.ts.
    expect(result.start.toISOString()).toBe('2025-07-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('labels the July 1 boundary identically regardless of host timezone', () => {
    // A UTC-midnight July 1 must land in the NEW academic year. Under the old
    // local-accessor implementation this returned '2024-2025' on any host west of
    // UTC, silently mis-routing email events and mislabelling cohorts.
    expect(getCurrentAcademicYear(new Date('2025-07-01T00:00:00.000Z')).label).toBe(
      '2025-2026'
    );
    expect(getCurrentAcademicYear(new Date('2025-06-30T23:59:59.999Z')).label).toBe(
      '2024-2025'
    );
  });

  it('returns current calendar year as start when in December', () => {
    const result = getCurrentAcademicYear(new Date('2025-12-15'));
    expect(result.label).toBe('2025-2026');
  });

  it('returns previous calendar year as start when in January', () => {
    const result = getCurrentAcademicYear(new Date('2026-01-15'));
    expect(result.label).toBe('2025-2026');
  });

  it('returns previous calendar year as start when in June', () => {
    const result = getCurrentAcademicYear(new Date('2026-06-30'));
    expect(result.label).toBe('2025-2026');
  });

  it('starts a new academic year on July 1', () => {
    const june30 = getCurrentAcademicYear(new Date('2025-06-30'));
    const july1 = getCurrentAcademicYear(new Date('2025-07-01'));
    expect(june30.label).toBe('2024-2025');
    expect(july1.label).toBe('2025-2026');
  });
});

describe('stripTime', () => {
  it('truncates to UTC midnight', () => {
    const input = new Date('2025-03-15T14:30:45.123Z');
    const result = stripTime(input);
    expect(result.toISOString()).toBe('2025-03-15T00:00:00.000Z');
  });

  it('preserves the UTC calendar date', () => {
    const input = new Date('2025-03-15T14:30:00.000Z');
    const result = stripTime(input);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(2);
    expect(result.getUTCDate()).toBe(15);
  });

  it('does not shift the calendar date on a host east or west of UTC', () => {
    // A CiviCRM date string parses to UTC midnight. Truncating it must be a
    // no-op, not a shift to the previous or next day.
    expect(stripTime(new Date('2026-07-01')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z'
    );
  });

  it('passes an invalid date through instead of producing a bogus one', () => {
    // CiviCRM can return a null date, which the service stringifies to "null".
    // eligibility.ts relies on NaN surviving so it can reject the row.
    expect(Number.isNaN(stripTime(new Date('null')).getTime())).toBe(true);
  });
});
