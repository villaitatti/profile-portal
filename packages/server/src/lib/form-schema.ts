import { z } from 'zod';
import type { FormDef, FormFieldDef } from '@itatti/shared';

function fieldToZod(field: FormFieldDef): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case 'checkbox':
      schema = z.boolean();
      break;
    case 'email':
      schema = z.string().email().max(254).transform((v) => v.trim().toLowerCase());
      break;
    case 'textarea':
      schema = z.string().max(field.maxLength ?? 5000).transform((v) => v.trim());
      break;
    default:
      schema = z.string().max(field.maxLength ?? 1000).transform((v) => v.trim());
      break;
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

export function buildFormSchema(formDef: FormDef): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const section of formDef.sections) {
    for (const field of section.fields) {
      shape[field.name] = fieldToZod(field);
    }
  }

  return z.object(shape).strict();
}
