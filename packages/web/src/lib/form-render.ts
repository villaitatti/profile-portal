import type { FormDef, FormFieldDef } from '@itatti/shared';

/**
 * Canonical (label, value) pair for a single rendered form field.
 * Mirrors the VisibleField type in packages/server/src/services/form-pdf.service.ts.
 * The parity test between the PDF renderer and this walker asserts deep
 * equality of these arrays against a shared fixture.
 */
export interface VisibleField {
  name: string;
  label: string;
  value: string;
}

function isFieldVisible(field: FormFieldDef, data: Record<string, unknown>): boolean {
  if (!field.conditionalOn) return true;
  return data[field.conditionalOn.field] === field.conditionalOn.value;
}

function isDataField(field: FormFieldDef): boolean {
  return field.type !== 'subheader';
}

/**
 * Walk formDef.sections, filter by conditionalOn, return the canonical
 * (label, value) list. Shared semantics with form-pdf.service.ts#getVisibleFields.
 */
export function getVisibleFields(
  formDef: FormDef,
  data: Record<string, unknown>
): VisibleField[] {
  const out: VisibleField[] = [];
  for (const section of formDef.sections) {
    for (const field of section.fields) {
      if (!isFieldVisible(field, data)) continue;
      if (!isDataField(field)) continue;
      out.push({
        name: field.name,
        label: field.label,
        value:
          field.type === 'repeatable-group'
            ? formatRepeatableGroupValue(data[field.name], field)
            : formatValue(data[field.name], field.type),
      });
    }
  }
  return out;
}

/**
 * Section-preserving walk — used by the detail pane to render section titles
 * alongside their visible fields. Returns a tree that mirrors the PDF's
 * per-section layout.
 */
export interface VisibleSection {
  title: string;
  description?: string;
  fields: VisibleField[];
}

export function getVisibleSections(
  formDef: FormDef,
  data: Record<string, unknown>
): VisibleSection[] {
  return formDef.sections
    .map((section) => ({
      title: section.title,
      description: section.description,
      fields: section.fields
        .filter((f) => isFieldVisible(f, data))
        .filter(isDataField)
        .map((f) => ({
          name: f.name,
          label: f.label,
          value:
            f.type === 'repeatable-group'
              ? formatRepeatableGroupValue(data[f.name], f)
              : formatValue(data[f.name], f.type),
        })),
    }))
    .filter((s) => s.fields.length > 0);
}

function formatRepeatableGroupValue(value: unknown, field: FormFieldDef): string {
  if (!Array.isArray(value) || value.length === 0) return '—';
  const childFields = field.fields?.filter(isDataField) ?? [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return String(item);
      }
      const data = item as Record<string, unknown>;
      const lines = childFields.map((childField) => {
        const formatted = formatValue(data[childField.name], childField.type);
        return `${childField.label}: ${formatted}`;
      });
      return `${field.itemLabel ?? 'Entry'} ${index + 1}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

/**
 * Format a single response value for display. Kept in lockstep with
 * packages/server/src/services/form-pdf.service.ts#formatValue. The parity
 * test pins them together.
 *
 *   null / undefined / "" / []                  → "—"
 *   boolean                                     → "Yes" / "No"
 *   field.type === 'date' (YYYY-MM-DD string)   → "D MMM YYYY" (local, no TZ shift)
 *   non-empty array                             → arr.join(", ")
 *   object                                      → JSON.stringify(value)
 *   anything else                               → String(value)
 */
export function formatValue(value: unknown, fieldType?: FormFieldDef['type']): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (value === '') return '—';
    if (fieldType === 'date') return formatDateOnly(value);
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(String).join(', ');
  if (typeof value === 'object') {
    // Same safety as the server walker — cyclic objects otherwise crash
    // the detail pane render.
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
  return String(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse 'YYYY-MM-DD' as a local date and format as 'D MMM YYYY'. Avoids the
 * `new Date("YYYY-MM-DD")` UTC-midnight bug that renders the previous day in
 * UTC- timezones. Rejects impossible calendar dates (2026-02-31, 2025-02-29)
 * via a Date round-trip. Returns the input unchanged on any failure.
 */
export function formatDateOnly(s: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return s;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return s;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return s;
  }
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Re-exported from @itatti/shared so the UI has a single import surface for
// form-render helpers. The string prefix itself lives in the shared registry
// module so server (who builds it) and web (who parses it) share a single
// source of truth — a typo on one side can't silently break the retired-form
// UI branch.
export { isRetiredFormTitle } from '@itatti/shared';
