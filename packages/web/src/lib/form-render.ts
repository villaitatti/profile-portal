import type { FormDef, FormFieldDef } from '@itatti/shared';
import {
  formatValue as sharedFormatValue,
  getVisibleFields as sharedGetVisibleFields,
  getVisibleSections as sharedGetVisibleSections,
  formatDateOnly as sharedFormatDateOnly,
  type FormatValueOptions as SharedFormatValueOptions,
  type VisibleField,
  type VisibleSection,
} from '@itatti/shared';
import { formatHumanDate } from './dates';

/**
 * Locale adapter over the single shared walker in @itatti/shared/form-render.
 * When opts is omitted, output is byte-identical to the server PDF renderer
 * ('Yes'/'No', 'Entry', 'D MMM YYYY'). The web detail pane passes the active
 * language so booleans, entry labels, and dates follow the UI locale (dates
 * as '24 April 2026' / '24 aprile 2026').
 */
export interface FormatValueOptions {
  lang: string;
  yes: string;
  no: string;
  entry: string;
}

export type { VisibleField, VisibleSection };

function toSharedOpts(opts?: FormatValueOptions): SharedFormatValueOptions | undefined {
  if (!opts) return undefined;
  return {
    yes: opts.yes,
    no: opts.no,
    entry: opts.entry,
    // The shared walker only calls this for validated calendar dates, so the
    // Date construction below cannot produce a shifted/invalid render.
    formatDate: (isoDate) => {
      const [y, m, d] = isoDate.split('-').map(Number);
      return formatHumanDate(new Date(y, m - 1, d), opts.lang);
    },
  };
}

export function getVisibleFields(
  formDef: FormDef,
  data: Record<string, unknown>,
  opts?: FormatValueOptions
): VisibleField[] {
  return sharedGetVisibleFields(formDef, data, toSharedOpts(opts));
}

export function getVisibleSections(
  formDef: FormDef,
  data: Record<string, unknown>,
  opts?: FormatValueOptions
): VisibleSection[] {
  return sharedGetVisibleSections(formDef, data, toSharedOpts(opts));
}

export function formatValue(
  value: unknown,
  fieldType?: FormFieldDef['type'],
  opts?: FormatValueOptions
): string {
  return sharedFormatValue(value, fieldType, toSharedOpts(opts));
}

export function formatDateOnly(s: string): string {
  return sharedFormatDateOnly(s);
}

// Re-exported from @itatti/shared so the UI has a single import surface for
// form-render helpers. The string prefix itself lives in the shared registry
// module so server (who builds it) and web (who parses it) share a single
// source of truth — a typo on one side can't silently break the retired-form
// UI branch.
export { isRetiredFormTitle } from '@itatti/shared';
