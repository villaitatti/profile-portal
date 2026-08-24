import { describe, expect, it } from 'vitest';
import { getFormDef, type FormDef } from '@itatti/shared';
import { buildFormSchema } from '../../lib/form-schema.js';

const optionForm: FormDef = {
  id: 'option-validation-test',
  title: 'Option Validation Test',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Options',
      fields: [
        {
          name: 'title',
          label: 'Title',
          type: 'select',
          required: false,
          options: ['Dr.', 'Prof.'],
        },
        {
          name: 'hasUsSsn',
          label: 'Do you have a US Social Security number?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
      ],
    },
  ],
};

const repeatableForm: FormDef = {
  id: 'repeatable-validation-test',
  title: 'Repeatable Validation Test',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Family',
      fields: [
        {
          name: 'childrenHeader',
          label: 'Children',
          type: 'subheader',
          required: false,
        },
        {
          name: 'children',
          label: 'Children',
          type: 'repeatable-group',
          required: false,
          fields: [
            { name: 'fullName', label: 'Full name', type: 'text', required: true },
            { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
            { name: 'datesOfStay', label: 'Dates of stay', type: 'text', required: true },
          ],
        },
      ],
    },
  ],
};

describe('buildFormSchema option fields', () => {
  it('accepts declared select/radio options and optional blank select values', () => {
    const schema = buildFormSchema(optionForm);

    expect(schema.safeParse({ title: '', hasUsSsn: 'No' }).success).toBe(true);
    expect(schema.safeParse({ title: 'Dr.', hasUsSsn: 'Yes' }).success).toBe(true);
  });

  it('rejects undeclared select and radio values', () => {
    const schema = buildFormSchema(optionForm);

    const parsed = schema.safeParse({ title: 'Sir', hasUsSsn: 'Maybe' });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toEqual([
        'Invalid option',
        'Invalid option',
      ]);
    }
  });
});

describe('buildFormSchema repeatable groups', () => {
  it('allows omitted optional repeatable groups and complete child rows', () => {
    const schema = buildFormSchema(repeatableForm);

    expect(schema.safeParse({}).success).toBe(true);
    expect(
      schema.safeParse({
        children: [
          {
            fullName: 'Giulia Bianchi',
            dateOfBirth: '2018-04-24',
            datesOfStay: 'September to December',
          },
        ],
      }).success
    ).toBe(true);
  });

  it('rejects partial child rows and subheader payload keys', () => {
    const schema = buildFormSchema(repeatableForm);

    expect(
      schema.safeParse({
        children: [{ fullName: 'Giulia Bianchi', dateOfBirth: '', datesOfStay: '' }],
      }).success
    ).toBe(false);
    expect(schema.safeParse({ childrenHeader: 'Children' }).success).toBe(false);
  });
});

describe('fellow-memorandum-v3 validation', () => {
  it('requires mobile phone and validates select values', () => {
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();
    const schema = buildFormSchema(formDef!);

    const base = {
      givenName: 'Maria',
      surname: 'Bianchi',
      email: 'maria@example.com',
      countryMovingFrom: 'Italy',
      hasUsSsn: 'No',
      statusAtItatti: 'Independent Scholar',
      nationality: 'Italian',
      legalStreetAddress: 'Via di Vincigliata 26',
      legalCity: 'Florence',
      legalCountry: 'Italy',
      emergencyName: 'Luca Bianchi',
      emergencyPhone: '+39 055 0000',
      emergencyEmail: 'luca@example.com',
      resources: 'University leave letter attached.',
    };

    expect(schema.safeParse(base).success).toBe(false);
    expect(schema.safeParse({ ...base, mobilePhone: '+39 333 0000' }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, mobilePhone: '+39 333 0000', hasUsSsn: 'Maybe' }).success
    ).toBe(false);
  });

  it('rejects impossible calendar dates submitted outside the browser date picker', () => {
    const form = getFormDef('fellow-memorandum-v3')!;
    const schema = buildFormSchema(form);
    const base = {
      givenName: 'Maria',
      surname: 'Bianchi',
      email: 'maria@example.com',
      mobilePhone: '+39 333 0000',
      countryMovingFrom: 'Italy',
      hasUsSsn: 'No',
      statusAtItatti: 'Independent Scholar',
      nationality: 'Italian',
      legalStreetAddress: 'Via di Vincigliata 26',
      legalCity: 'Florence',
      legalCountry: 'Italy',
      emergencyName: 'Luca Bianchi',
      emergencyPhone: '+39 055 0000',
      emergencyEmail: 'luca@example.com',
      resources: 'University leave letter attached.',
    };

    expect(schema.safeParse({ ...base, dateOfBirth: '2026-02-31' }).success).toBe(false);
    expect(schema.safeParse({ ...base, dateOfBirth: '2026-02-28' }).success).toBe(true);
    expect(schema.safeParse({ ...base, dateOfBirth: '2099-01-01' }).success).toBe(false);
    expect(schema.safeParse({ ...base, dateOfBirth: '1899-12-31' }).success).toBe(false);
  });
});

describe('conditionally required fields', () => {
  // No definition in FORM_REGISTRY is currently both `required` and
  // `conditionalOn`, so this behaviour is not reachable through a live form yet.
  // It is enforced anyway because the per-field builder types every conditional
  // field as optional, meaning a future "required when X" field would silently
  // accept an empty value from any client that skips the browser — and the PDF
  // would render an em-dash where the answer belongs.
  const conditionalForm: FormDef = {
    id: 'conditional-required-test',
    title: 'Conditional Required Test',
    appointmentTypes: ['Fellow'],
    sections: [
      {
        title: 'Status',
        fields: [
          {
            name: 'statusAtItatti',
            label: 'Status',
            type: 'select',
            required: true,
            options: ['Independent Scholar', 'Other'],
          },
          {
            name: 'statusOther',
            label: 'If "Other" please indicate',
            type: 'text',
            required: true,
            conditionalOn: { field: 'statusAtItatti', value: 'Other' },
          },
        ],
      },
    ],
  };

  const schema = buildFormSchema(conditionalForm);

  it('requires the dependent field when the condition is satisfied', () => {
    const result = schema.safeParse({ statusAtItatti: 'Other', statusOther: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'statusOther')).toBe(true);
    }
  });

  it('rejects a whitespace-only value for a satisfied condition', () => {
    expect(schema.safeParse({ statusAtItatti: 'Other', statusOther: '   ' }).success).toBe(
      false
    );
  });

  it('rejects an omitted dependent field when the condition is satisfied', () => {
    expect(schema.safeParse({ statusAtItatti: 'Other' }).success).toBe(false);
  });

  it('accepts the dependent field when the condition is satisfied and filled', () => {
    expect(
      schema.safeParse({ statusAtItatti: 'Other', statusOther: 'Visiting Lecturer' }).success
    ).toBe(true);
  });

  it('leaves the dependent field optional when the condition is not satisfied', () => {
    expect(schema.safeParse({ statusAtItatti: 'Independent Scholar' }).success).toBe(true);
    expect(
      schema.safeParse({ statusAtItatti: 'Independent Scholar', statusOther: '' }).success
    ).toBe(true);
  });

  it('still rejects unknown keys (strict object survives superRefine)', () => {
    expect(
      schema.safeParse({ statusAtItatti: 'Other', statusOther: 'x', bogus: 'y' }).success
    ).toBe(false);
  });
});
