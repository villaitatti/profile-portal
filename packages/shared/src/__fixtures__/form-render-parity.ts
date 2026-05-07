import type { FormDef, FormResponseData } from '../types/forms.js';

/**
 * Shared fixture for the form-render parity test. Imported by BOTH the
 * server-side PDF test and the web-side walker test. A change here forces
 * both surfaces to update together, which is the point.
 *
 * The fixture is hand-crafted (NOT a real registry entry) so the parity
 * test stays stable when the real registry evolves. It exercises every
 * format-rule case the walker supports:
 *
 *   - plain text
 *   - date field (YYYY-MM-DD → "D MMM YYYY", TZ-independent)
 *   - boolean true / false → "Yes" / "No"
 *   - conditional field VISIBLE (gate matches)
 *   - conditional field HIDDEN (gate does not match — must NOT appear)
 *   - null / undefined / empty string → "—"
 *   - numeric 0 → "0" (regression guard: blanket falsy check would print "—")
 *   - empty array → "—"
 *   - non-empty array → "a, b, c"
 *   - second section with its own fields
 */
export const parityFormDef: FormDef = {
  id: 'parity-fixture',
  title: 'Form-Render Parity Fixture',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Personal',
      fields: [
        { name: 'fullName', label: 'Full name', type: 'text', required: true },
        { name: 'birthdate', label: 'Birthdate', type: 'date', required: true },
        {
          name: 'hasSsn',
          label: 'Do you have a US SSN',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          name: 'ssn',
          label: 'SSN',
          type: 'text',
          required: false,
          conditionalOn: { field: 'hasSsn', value: 'Yes' },
        },
        {
          name: 'nonResidentDetails',
          label: 'Non-resident details',
          type: 'textarea',
          required: false,
          conditionalOn: { field: 'hasSsn', value: 'No' },
        },
      ],
    },
    {
      title: 'Details',
      fields: [
        { name: 'bio', label: 'Bio', type: 'textarea', required: false },
        { name: 'isAlumnus', label: 'Alumnus', type: 'checkbox', required: false },
        { name: 'yearsActive', label: 'Years active', type: 'text', required: false },
        { name: 'tags', label: 'Tags', type: 'text', required: false },
        { name: 'emptyTags', label: 'Empty tags', type: 'text', required: false },
        { name: 'missing', label: 'Missing field', type: 'text', required: false },
        { name: 'blank', label: 'Blank string', type: 'text', required: false },
      ],
    },
  ],
};

/**
 * Response data exercising every format rule. `hasSsn = 'Yes'` means `ssn`
 * is visible AND `nonResidentDetails` is hidden — the parity test checks
 * both inclusion AND exclusion.
 *
 * `yearsActive: 0` is the canonical regression case: a blanket
 * `value === null || value === undefined || value === ''` check would render
 * 0 as "—". The walker must render it as "0".
 */
export const parityResponseData: FormResponseData & Record<string, unknown> = {
  fullName: 'Maria Bianchi',
  birthdate: '2026-04-24',
  hasSsn: 'Yes',
  ssn: '123-45-6789',
  nonResidentDetails: 'SHOULD NOT APPEAR — gated off',
  bio: '',
  isAlumnus: true,
  yearsActive: 0 as unknown as string, // FormResponseData declares string|boolean|null; tests pass number through
  tags: ['alpha', 'beta', 'gamma'] as unknown as string,
  emptyTags: [] as unknown as string,
  // missing: intentionally omitted — tests the null/undefined path
  blank: '',
};

/**
 * Expected (label, value) output. A shared source of truth: if either
 * renderer drifts from this list, the parity test fires.
 *
 * Order matches formDef.sections in formDef order, fields in section order,
 * with conditionalOn-hidden fields removed.
 */
export const parityExpectedFields: { name: string; label: string; value: string }[] = [
  { name: 'fullName', label: 'Full name', value: 'Maria Bianchi' },
  { name: 'birthdate', label: 'Birthdate', value: '24 Apr 2026' },
  { name: 'hasSsn', label: 'Do you have a US SSN', value: 'Yes' },
  { name: 'ssn', label: 'SSN', value: '123-45-6789' },
  // nonResidentDetails intentionally absent — conditionalOn gate does not match
  { name: 'bio', label: 'Bio', value: '—' },
  { name: 'isAlumnus', label: 'Alumnus', value: 'Yes' },
  { name: 'yearsActive', label: 'Years active', value: '0' },
  { name: 'tags', label: 'Tags', value: 'alpha, beta, gamma' },
  { name: 'emptyTags', label: 'Empty tags', value: '—' },
  { name: 'missing', label: 'Missing field', value: '—' },
  { name: 'blank', label: 'Blank string', value: '—' },
];
