import { z } from 'zod';
import type { FormDef, FormFieldDef } from '@itatti/shared';

function todayInRome(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function fieldToZod(field: FormFieldDef): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case 'subheader':
      schema = z.never();
      break;
    case 'repeatable-group': {
      const itemShape: Record<string, z.ZodTypeAny> = {};
      for (const childField of field.fields ?? []) {
        if (childField.type === 'subheader') continue;
        itemShape[childField.name] = fieldToZod(childField);
      }
      schema = z.array(z.object(itemShape).strict());
      break;
    }
    case 'checkbox':
      schema = z.boolean();
      break;
    case 'email':
      schema = z.string().email().max(254).transform((v) => v.trim().toLowerCase());
      break;
    case 'select':
    case 'radio':
      schema = z
        .string()
        .max(field.maxLength ?? 1000)
        .transform((v) => v.trim())
        .refine((v) => !field.options || field.options.includes(v), 'Invalid option');
      break;
    case 'textarea':
      schema = z.string().max(field.maxLength ?? 5000).transform((v) => v.trim());
      break;
    case 'date':
      schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
        .refine((value) => {
          const parsed = new Date(`${value}T12:00:00.000Z`);
          return (
            !Number.isNaN(parsed.getTime()) &&
            parsed.toISOString().slice(0, 10) === value
          );
        }, 'Invalid calendar date')
        .refine(
          (value) => !field.minDate || value >= field.minDate,
          field.minDate ? `Date must be on or after ${field.minDate}` : 'Invalid date'
        )
        .refine(
          (value) => {
            if (!field.maxDate) return true;
            const maximum =
              field.maxDate === 'today' ? todayInRome() : field.maxDate;
            return value <= maximum;
          },
          field.maxDate === 'today'
            ? 'Date cannot be in the future'
            : field.maxDate
              ? `Date must be on or before ${field.maxDate}`
              : 'Invalid date'
        );
      break;
    default:
      schema = z.string().max(field.maxLength ?? 1000).transform((v) => v.trim());
      break;
  }

  if (field.type === 'subheader') return schema;

  if (field.type === 'repeatable-group') {
    if (field.required) {
      schema = (schema as z.ZodArray<z.ZodTypeAny>).min(1);
    } else {
      schema = schema.optional();
    }
    return schema;
  }

  if (field.required && !field.conditionalOn && field.type !== 'checkbox') {
    schema = schema.refine(
      (value) => typeof value !== 'string' || value.length > 0,
      'Required'
    );
  }

  if (!field.required || field.conditionalOn) {
    if (field.type === 'checkbox') {
      schema = schema.optional();
    } else {
      schema = z.union([schema, z.literal('')]).optional();
    }
  }

  return schema;
}

export function buildFormSchema(formDef: FormDef) {
  const shape: Record<string, z.ZodTypeAny> = {};

  // Fields gated by `conditionalOn` are typed as optional above, because at the
  // per-field level we can't see whether the gate is satisfied. Collect them so a
  // cross-field check can enforce requiredness once the whole object is known.
  const conditionallyRequired: { field: string; on: { field: string; value: string } }[] = [];

  for (const section of formDef.sections) {
    for (const field of section.fields) {
      if (field.type === 'subheader') continue;
      shape[field.name] = fieldToZod(field);
      if (field.required && field.conditionalOn && field.type !== 'checkbox') {
        conditionallyRequired.push({ field: field.name, on: field.conditionalOn });
      }
    }
  }

  const base = z.object(shape).strict();
  if (conditionallyRequired.length === 0) return base;

  // Enforce "required when its condition holds". Without this, a raw API client
  // could store an empty `statusOther` alongside `statusAtItatti = "Other"` — the
  // browser enforces it, the server didn't — and the generated PDF rendered an
  // em-dash where the answer should be.
  return base.superRefine((data, ctx) => {
    const values = data as Record<string, unknown>;
    for (const { field, on } of conditionallyRequired) {
      if (values[on.field] !== on.value) continue;
      const value = values[field];
      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0);
      if (isEmpty) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Required',
        });
      }
    }
  });
}
