import { describe, it, expect } from 'vitest';
import {
  getFormDef,
  getFormsForAppointmentType,
  getFormsForFellowship,
  isActiveFormDef,
  TITLE_OPTIONS,
} from '@itatti/shared';

const standardTermFellowshipValues = [
  'berenson_fellow',
  'wallace_fellow',
  'digital_humanities_fellow',
  'craig_hugh_smyth_fellow',
  'david_&_julie_tobey_fellow',
  'i_tatti_prado-joint-fellowship',
  'warburg-i-tatti-joint',
  'marlène_and_paolo_fresco_fellowship_in_african_studies',
];

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

  it('keeps the v2 fellowship form resolvable but retired', () => {
    const v2 = getFormDef('fellow-memorandum-v2');

    expect(v2).toBeDefined();
    expect(v2 && isActiveFormDef(v2)).toBe(false);
  });

  it('uses the v3 fellowship form for new Fellow invitations', () => {
    const forms = getFormsForAppointmentType('Fellow');

    expect(forms.map((form) => form.id)).toEqual(['fellow-memorandum-v3']);
    expect(forms.every(isActiveFormDef)).toBe(true);
    expect(
      forms[0].sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === 'mobilePhone')
    ).toMatchObject({ required: true });
    expect(
      forms[0].sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === 'hasUsSsn')
    ).toMatchObject({ layout: 'half' });
    expect(
      forms[0].sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === 'statusAtItatti')
    ).toMatchObject({ layout: 'half' });
  });

  it('uses the standard term form for the configured raw term fellowship values', () => {
    for (const fellowshipValue of standardTermFellowshipValues) {
      const forms = getFormsForFellowship('Fellow (short Term)', fellowshipValue);

      expect(forms.map((form) => form.id)).toEqual(['term-fellow-memorandum-v1']);
    }
  });

  it('uses the Dumbarton Oaks term form for the configured raw fellowship value', () => {
    const forms = getFormsForFellowship(
      'Fellow (short Term)',
      'i_tatti_dumbarton_oaks_joint_fellow'
    );

    expect(forms.map((form) => form.id)).toEqual([
      'dumbarton-oaks-fellow-memorandum-v1',
    ]);
  });

  it('uses the graduate term form for the configured raw fellowship value', () => {
    const forms = getFormsForFellowship('Fellow (short Term)', 'graduate_visiting_fellow');

    expect(forms.map((form) => form.id)).toEqual(['graduate-fellow-memorandum-v1']);
  });

  it('normalizes the term appointment while still requiring a matching raw fellowship value', () => {
    expect(
      getFormsForFellowship('fellow_short_term', 'berenson_fellow').map((form) => form.id)
    ).toEqual(['term-fellow-memorandum-v1']);

    expect(getFormsForFellowship('Fellow (short Term)', 'artist_in_residence')).toEqual([]);
    expect(getFormsForFellowship('Fellow (short Term)')).toEqual([]);
  });

  it('centralizes inclusive title dropdown options', () => {
    expect(TITLE_OPTIONS).toEqual([
      'Dr.',
      'Prof.',
      'Mr.',
      'Mrs.',
      'Ms.',
      'Mx.',
    ]);
  });
});
