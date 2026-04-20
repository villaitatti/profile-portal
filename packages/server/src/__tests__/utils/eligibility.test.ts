import { describe, it, expect } from 'vitest';
import {
  classifyFellowship,
  evaluateEligibility,
  pickBioEmailTargetYear,
  academicYearLabelForFellowship,
  currentAcademicYearLabel,
} from '../../utils/eligibility.js';
import type { CiviCRMFellowship } from '@itatti/shared';

function makeFellowship(overrides: Partial<CiviCRMFellowship> = {}): CiviCRMFellowship {
  return {
    id: 1,
    contactId: 100,
    startDate: '2024-07-01',
    endDate: '2025-06-30',
    fellowshipAccepted: true,
    ...overrides,
  };
}

describe('classifyFellowship', () => {
  it('returns "past" when fellowship ended before today', () => {
    const ref = new Date('2025-08-01');
    expect(classifyFellowship('2024-07-01', '2025-06-30', ref)).toBe('past');
  });

  it('returns "current" when today is within the fellowship period', () => {
    const ref = new Date('2025-01-15');
    expect(classifyFellowship('2024-07-01', '2025-06-30', ref)).toBe('current');
  });

  it('returns "upcoming" when fellowship starts after today', () => {
    const ref = new Date('2024-05-01');
    expect(classifyFellowship('2024-07-01', '2025-06-30', ref)).toBe('upcoming');
  });

  it('returns "current" when fellowship ends today (inclusive)', () => {
    const ref = new Date('2025-06-30');
    expect(classifyFellowship('2024-07-01', '2025-06-30', ref)).toBe('current');
  });

  it('returns "current" when fellowship starts today (inclusive)', () => {
    const ref = new Date('2024-07-01');
    expect(classifyFellowship('2024-07-01', '2025-06-30', ref)).toBe('current');
  });
});

describe('evaluateEligibility', () => {
  it('returns not eligible when no fellowships', () => {
    const result = evaluateEligibility([]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_fellowship_records');
  });

  it('returns eligible when multiple fellowships exist', () => {
    const fellowships = [makeFellowship({ id: 1 }), makeFellowship({ id: 2 })];
    const result = evaluateEligibility(fellowships);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('multiple_fellowships');
  });

  it('returns eligible for single past fellowship', () => {
    const ref = new Date('2026-01-01');
    const result = evaluateEligibility([makeFellowship()], ref);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('single_past_fellowship');
  });

  it('returns eligible for single current fellowship', () => {
    const ref = new Date('2025-01-15');
    const result = evaluateEligibility([makeFellowship()], ref);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('single_current_fellowship');
  });

  it('returns eligible for single upcoming accepted fellowship', () => {
    const ref = new Date('2024-05-01');
    const result = evaluateEligibility(
      [makeFellowship({ fellowshipAccepted: true })],
      ref
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('single_upcoming_accepted');
  });

  it('returns not eligible for single upcoming not-accepted fellowship', () => {
    const ref = new Date('2024-05-01');
    const result = evaluateEligibility(
      [makeFellowship({ fellowshipAccepted: false })],
      ref
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('single_upcoming_not_accepted');
  });
});

describe('academicYearLabelForFellowship', () => {
  it('maps a July-start fellowship to "YYYY-YYYY+1"', () => {
    const f = makeFellowship({ startDate: '2026-07-01', endDate: '2027-06-30' });
    expect(academicYearLabelForFellowship(f)).toBe('2026-2027');
  });

  it('maps a September-start fellowship to the same academic year as July', () => {
    const f = makeFellowship({ startDate: '2026-09-15', endDate: '2027-06-30' });
    expect(academicYearLabelForFellowship(f)).toBe('2026-2027');
  });

  it('maps a January-start fellowship back to "YYYY-1 - YYYY"', () => {
    const f = makeFellowship({ startDate: '2027-01-10', endDate: '2027-06-30' });
    expect(academicYearLabelForFellowship(f)).toBe('2026-2027');
  });

  it('maps a June-start fellowship (edge, month=5) to "YYYY-1 - YYYY"', () => {
    const f = makeFellowship({ startDate: '2027-06-01', endDate: '2027-06-30' });
    expect(academicYearLabelForFellowship(f)).toBe('2026-2027');
  });
});

describe('currentAcademicYearLabel', () => {
  it('returns the current AY label when called in August', () => {
    expect(currentAcademicYearLabel(new Date('2026-08-15'))).toBe('2026-2027');
  });

  it('returns the prior-start AY label when called in February', () => {
    expect(currentAcademicYearLabel(new Date('2026-02-15'))).toBe('2025-2026');
  });
});

describe('pickBioEmailTargetYear', () => {
  it('returns null when no fellowships exist', () => {
    expect(pickBioEmailTargetYear([])).toBeNull();
  });

  it('returns null when only a past fellowship exists', () => {
    const ref = new Date('2027-01-01');
    const past = makeFellowship({ startDate: '2024-07-01', endDate: '2025-06-30' });
    expect(pickBioEmailTargetYear([past], ref)).toBeNull();
  });

  it('returns null when only an un-accepted upcoming fellowship exists', () => {
    const ref = new Date('2026-04-01');
    const upcoming = makeFellowship({
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      fellowshipAccepted: false,
    });
    expect(pickBioEmailTargetYear([upcoming], ref)).toBeNull();
  });

  it('picks the current fellowship when one exists', () => {
    const ref = new Date('2026-01-15');
    const current = makeFellowship({
      id: 10,
      startDate: '2025-07-01',
      endDate: '2026-06-30',
    });
    const result = pickBioEmailTargetYear([current], ref);
    expect(result).not.toBeNull();
    expect(result!.academicYear).toBe('2025-2026');
    expect(result!.fellowship.id).toBe(10);
  });

  it('prefers current over an accepted upcoming fellowship', () => {
    const ref = new Date('2026-01-15');
    const current = makeFellowship({
      id: 10,
      startDate: '2025-07-01',
      endDate: '2026-06-30',
    });
    const upcoming = makeFellowship({
      id: 20,
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      fellowshipAccepted: true,
    });
    const result = pickBioEmailTargetYear([current, upcoming], ref);
    expect(result!.fellowship.id).toBe(10);
    expect(result!.academicYear).toBe('2025-2026');
  });

  it('falls back to an accepted upcoming fellowship when no current one exists', () => {
    const ref = new Date('2026-04-01');
    const upcoming = makeFellowship({
      id: 20,
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      fellowshipAccepted: true,
    });
    const result = pickBioEmailTargetYear([upcoming], ref);
    expect(result!.fellowship.id).toBe(20);
    expect(result!.academicYear).toBe('2026-2027');
  });

  it('picks the earliest-starting accepted upcoming when there are multiple', () => {
    const ref = new Date('2026-04-01');
    const later = makeFellowship({
      id: 30,
      startDate: '2027-07-01',
      endDate: '2028-06-30',
      fellowshipAccepted: true,
    });
    const earlier = makeFellowship({
      id: 20,
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      fellowshipAccepted: true,
    });
    const result = pickBioEmailTargetYear([later, earlier], ref);
    expect(result!.fellowship.id).toBe(20);
  });

  it('ignores un-accepted upcoming fellowships even when the earliest', () => {
    const ref = new Date('2026-04-01');
    const notAccepted = makeFellowship({
      id: 40,
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      fellowshipAccepted: false,
    });
    const accepted = makeFellowship({
      id: 50,
      startDate: '2027-07-01',
      endDate: '2028-06-30',
      fellowshipAccepted: true,
    });
    const result = pickBioEmailTargetYear([notAccepted, accepted], ref);
    expect(result!.fellowship.id).toBe(50);
  });
});
