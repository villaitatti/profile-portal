import { describe, it, expect } from 'vitest';
import {
  getFormDef,
  getFormsForAppointmentType,
  isActiveFormDef,
  TITLE_OPTIONS,
} from '@itatti/shared';

describe('form registry active/retired behavior', () => {
  it('keeps the legacy fellowship form resolvable but retired', () => {
    const legacy = getFormDef('fellow-memorandum');

    expect(legacy).toBeDefined();
    expect(legacy && isActiveFormDef(legacy)).toBe(false);
    expect(legacy?.sections[0].fields.some((field) => field.name === 'legalAddress')).toBe(true);
    expect(
      legacy?.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === 'emergencyPhone')?.label
    ).toBe('Telephone (including country code)');
  });

  it('uses the v2 fellowship form for new Fellow invitations', () => {
    const forms = getFormsForAppointmentType('Fellow');

    expect(forms.map((form) => form.id)).toEqual(['fellow-memorandum-v2']);
    expect(forms.every(isActiveFormDef)).toBe(true);
  });

  it('centralizes inclusive title dropdown options', () => {
    expect(TITLE_OPTIONS).toEqual([
      'Mr.',
      'Mrs.',
      'Ms.',
      'Mx.',
      'Dr.',
      'Prof.',
      'Prefer not to say',
    ]);
  });
});
