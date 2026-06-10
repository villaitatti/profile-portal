import { describe, it, expect } from 'vitest';
import {
  formatValue,
  formatDateOnly,
  getVisibleFields,
  getVisibleSections,
  isRetiredFormTitle,
} from '@/lib/form-render';
import {
  parityFormDef,
  parityResponseData,
  parityExpectedFields,
} from '@itatti/shared';

describe('formatValue', () => {
  it('renders null and undefined as —', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
  });

  it('renders empty string as —', () => {
    expect(formatValue('')).toBe('—');
  });

  it('renders zero as "0" (regression: not —)', () => {
    expect(formatValue(0)).toBe('0');
  });

  it('renders booleans as Yes/No', () => {
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
  });

  it('renders empty array as —', () => {
    expect(formatValue([])).toBe('—');
  });

  it('renders non-empty array as comma-joined', () => {
    expect(formatValue(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('stringifies plain objects', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('leaves plain strings unchanged when fieldType is not date', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  it('formats date-typed YYYY-MM-DD as D MMM YYYY', () => {
    expect(formatValue('2026-04-24', 'date')).toBe('24 Apr 2026');
    expect(formatValue('2026-01-01', 'date')).toBe('1 Jan 2026');
    expect(formatValue('2026-12-31', 'date')).toBe('31 Dec 2026');
  });

  it('returns the raw string when a date-typed value is not parseable', () => {
    expect(formatValue('not-a-date', 'date')).toBe('not-a-date');
    expect(formatValue('2026-13-01', 'date')).toBe('2026-13-01');
  });

  it('does NOT format date-shaped strings when fieldType is not date', () => {
    // Heuristic-matching date strings was rejected in the design — we go
    // off field.type only. A text field holding "2026-04-24" stays raw.
    expect(formatValue('2026-04-24')).toBe('2026-04-24');
  });
});

describe('formatDateOnly (TZ-independent by construction)', () => {
  // The critical bug this guards: new Date("2026-04-24") parses as UTC
  // midnight. Naive toLocaleDateString in UTC-07:00 (Los Angeles) would
  // render "23 Apr 2026" instead of "24 Apr 2026". Our parser splits the
  // string and reads the day/month/year from the regex match directly,
  // never involving a Date object — so the output is pure function of the
  // input and cannot shift regardless of host TZ.
  it('parses early-month and end-of-month days correctly', () => {
    expect(formatDateOnly('2026-04-24')).toBe('24 Apr 2026');
    expect(formatDateOnly('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDateOnly('2026-12-31')).toBe('31 Dec 2026');
  });

  it('rejects malformed strings', () => {
    expect(formatDateOnly('2026/04/24')).toBe('2026/04/24');
    expect(formatDateOnly('24-04-2026')).toBe('24-04-2026');
    expect(formatDateOnly('')).toBe('');
    expect(formatDateOnly('2026-13-01')).toBe('2026-13-01'); // month 13 is invalid
  });

  it('rejects impossible calendar dates (would otherwise roll into the next month)', () => {
    // Date.UTC-or-local constructor silently rolls 2026-02-31 → 2026-03-03.
    // The round-trip check catches this and returns the input unchanged so
    // the detail pane doesn't show "31 Feb 2026" as if it were intentional.
    expect(formatDateOnly('2026-02-31')).toBe('2026-02-31');
    expect(formatDateOnly('2025-02-29')).toBe('2025-02-29'); // not a leap year
    expect(formatDateOnly('2026-04-31')).toBe('2026-04-31'); // April has 30 days
    expect(formatDateOnly('2024-02-29')).toBe('29 Feb 2024'); // 2024 IS a leap year
  });
});

describe('getVisibleFields — parity fixture', () => {
  it('produces the expected canonical (label, value) list', () => {
    const out = getVisibleFields(parityFormDef, parityResponseData);
    expect(out).toEqual(parityExpectedFields);
  });

  it('omits fields whose conditionalOn gate does not match', () => {
    const out = getVisibleFields(parityFormDef, parityResponseData);
    const names = out.map((f) => f.name);
    expect(names).toContain('ssn'); // hasSsn === 'Yes', shown
    expect(names).not.toContain('nonResidentDetails'); // hidden
  });

  it('flips visibility when the conditionalOn gate flips', () => {
    const data = { ...parityResponseData, hasSsn: 'No' };
    const out = getVisibleFields(parityFormDef, data);
    const names = out.map((f) => f.name);
    expect(names).not.toContain('ssn');
    expect(names).toContain('nonResidentDetails');
  });
});

describe('getVisibleSections', () => {
  it('groups visible fields by section title, dropping empty sections', () => {
    const sections = getVisibleSections(parityFormDef, parityResponseData);
    expect(sections.map((s) => s.title)).toEqual(['Personal', 'Details']);
    expect(sections[0].fields.map((f) => f.name)).toContain('ssn');
    expect(sections[0].fields.map((f) => f.name)).not.toContain('nonResidentDetails');
  });

  it('drops a section entirely when all its fields are hidden', () => {
    const minimalDef = {
      ...parityFormDef,
      sections: [
        {
          title: 'Conditional-only',
          fields: [
            {
              name: 'gated',
              label: 'Gated',
              type: 'text' as const,
              required: false,
              conditionalOn: { field: 'nope', value: 'yes' },
            },
          ],
        },
      ],
    };
    const sections = getVisibleSections(minimalDef, {});
    expect(sections).toEqual([]);
  });

  it('formats repeatable groups as readable entries', () => {
    const formDef = {
      ...parityFormDef,
      sections: [
        {
          title: 'Family',
          fields: [
            {
              name: 'children',
              label: 'Children',
              type: 'repeatable-group' as const,
              required: false,
              itemLabel: 'Child',
              fields: [
                { name: 'fullName', label: 'Full name', type: 'text' as const, required: true },
                { name: 'dateOfBirth', label: 'Date of birth', type: 'date' as const, required: true },
                { name: 'datesOfStay', label: 'Dates of stay', type: 'text' as const, required: true },
              ],
            },
          ],
        },
      ],
    };

    const sections = getVisibleSections(formDef, {
      children: [
        {
          fullName: 'Giulia Bianchi',
          dateOfBirth: '2018-04-24',
          datesOfStay: 'September to December',
        },
      ],
    });

    expect(sections[0].fields[0]).toEqual({
      name: 'children',
      label: 'Children',
      value:
        'Child 1\nFull name: Giulia Bianchi\nDate of birth: 24 Apr 2018\nDates of stay: September to December',
    });
  });
});

describe('isRetiredFormTitle', () => {
  it('matches the server retired-form fallback prefix', () => {
    expect(isRetiredFormTitle('(retired form: ancient-survey)')).toBe(true);
  });

  it('rejects live form titles', () => {
    expect(isRetiredFormTitle('Memorandum I Tatti Fellowship')).toBe(false);
    expect(isRetiredFormTitle('')).toBe(false);
  });
});
