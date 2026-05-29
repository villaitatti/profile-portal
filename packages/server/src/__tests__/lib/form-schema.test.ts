import { describe, expect, it } from 'vitest';
import type { FormDef } from '@itatti/shared';
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
