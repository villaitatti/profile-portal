import { describe, it, expect } from 'vitest';
import { classifyFellowship, evaluateEligibility } from '../../utils/eligibility.js';
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
