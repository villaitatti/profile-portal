import type { FormDef, FormFieldDef } from './types/forms.js';

/**
 * The single form-response display walker: walks formDef.sections, filters
 * fields by their conditionalOn against the response data, and formats each
 * value for display.
 *
 * One implementation serves both render surfaces:
 *   - the server PDF renderer (form-pdf.service.ts) uses the defaults
 *     ('Yes'/'No', 'Entry', 'D MMM YYYY')
 *   - the web detail pane passes localized strings and a localized date
 *     formatter via {@link FormatValueOptions}
 *
 * It used to be written twice (server + web) and kept in lockstep by a parity
 * test; that test is now a unit test of this module.
 */
export interface FormatValueOptions {
  yes: string;
  no: string;
  entry: string;
  /**
   * Localized renderer for 'YYYY-MM-DD' date values. Receives only strings
   * that {@link formatDateOnly} would accept; impossible dates never reach it.
   * Default: 'D MMM YYYY' via formatDateOnly.
   */
  formatDate?: (isoDate: string) => string;
}

/** Canonical (label, value) pair for a single rendered form field. */
export interface VisibleField {
  name: string;
  label: string;
  value: string;
}

/** Section-preserving walk result — section titles with their visible fields. */
export interface VisibleSection {
  title: string;
  description?: string;
  fields: VisibleField[];
}

export function isFieldVisible(field: FormFieldDef, data: Record<string, unknown>): boolean {
  if (!field.conditionalOn) return true;
  return data[field.conditionalOn.field] === field.conditionalOn.value;
}

export function isDataField(field: FormFieldDef): boolean {
  return field.type !== 'subheader';
}

/** Flat walk: every visible data field across all sections, in order. */
export function getVisibleFields(
  formDef: FormDef,
  data: Record<string, unknown>,
  opts?: FormatValueOptions
): VisibleField[] {
  return getVisibleSections(formDef, data, opts).flatMap((section) => section.fields);
}

/** Tree walk mirroring the PDF's per-section layout; empty sections dropped. */
export function getVisibleSections(
  formDef: FormDef,
  data: Record<string, unknown>,
  opts?: FormatValueOptions
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
              ? formatRepeatableGroupValue(data[f.name], f, opts)
              : formatValue(data[f.name], f.type, opts),
        })),
    }))
    .filter((s) => s.fields.length > 0);
}

export function formatRepeatableGroupValue(
  value: unknown,
  field: FormFieldDef,
  opts?: FormatValueOptions
): string {
  if (!Array.isArray(value) || value.length === 0) return '—';
  const childFields = field.fields?.filter(isDataField) ?? [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return String(item);
      }
      const data = item as Record<string, unknown>;
      const lines = childFields.map((childField) => {
        const formatted = formatValue(data[childField.name], childField.type, opts);
        return `${childField.label}: ${formatted}`;
      });
      // Server-authored itemLabel wins (form-definition content stays as-is);
      // the generic fallback follows the caller's locale.
      return `${field.itemLabel ?? opts?.entry ?? 'Entry'} ${index + 1}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

/**
 * Format a single response value for display. Explicit rule table to avoid
 * coercion bugs (notably: `0` must render as "0", not "—"; `false` renders
 * as "No", not "—").
 *
 *   null / undefined / "" / []                  → "—"
 *   boolean                                     → "Yes" / "No" (or opts.yes/no)
 *   field.type === 'date' (YYYY-MM-DD string)   → "D MMM YYYY" (or opts.formatDate)
 *   non-empty array                             → arr.join(", ")
 *   object                                      → JSON.stringify(value)
 *   anything else                               → String(value)
 */
export function formatValue(
  value: unknown,
  fieldType?: FormFieldDef['type'],
  opts?: FormatValueOptions
): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') {
    if (opts) return value ? opts.yes : opts.no;
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    if (value === '') return '—';
    if (fieldType === 'date') return formatDateOnly(value, opts?.formatDate);
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(String).join(', ');
  if (typeof value === 'object') {
    // Cyclic objects otherwise crash the render surface.
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
 * Parse 'YYYY-MM-DD' as a local date and format as 'D MMM YYYY' (or via the
 * caller's formatter). Avoids the `new Date("YYYY-MM-DD")` UTC-midnight bug
 * that renders the previous day in UTC- timezones. Rejects impossible
 * calendar dates (2026-02-31, 2025-02-29) via a Date round-trip. Returns the
 * input unchanged on any failure.
 */
export function formatDateOnly(s: string, format?: (isoDate: string) => string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return s;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return s;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return s;
  }
  if (format) return format(s);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
