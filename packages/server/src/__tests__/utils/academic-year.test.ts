import { describe, it, expect } from 'vitest';
import { getCurrentAcademicYear, stripTime } from '../../utils/academic-year.js';

describe('getCurrentAcademicYear', () => {
  it('returns current calendar year as start when in July', () => {
    const result = getCurrentAcademicYear(new Date('2025-07-01'));
    expect(result.label).toBe('2025-2026');
    expect(result.start).toEqual(new Date(2025, 6, 1));
    expect(result.end).toEqual(new Date(2026, 5, 30));
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
  it('removes hours, minutes, and seconds', () => {
    const input = new Date('2025-03-15T14:30:45.123Z');
    const result = stripTime(input);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('preserves year, month, and day', () => {
    const input = new Date(2025, 2, 15, 14, 30);
    const result = stripTime(input);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(15);
  });
});
