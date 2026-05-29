import ReactPDF from '@react-pdf/renderer';
import React from 'react';
import type { FormDef, FormFieldDef } from '@itatti/shared';

const { Document, Page, Text, View, StyleSheet } = ReactPDF;

/**
 * Canonical (label, value) pair that appears in the rendered form output.
 * Produced by {@link getVisibleFields}; consumed by the PDF renderer AND by
 * the parity test that compares PDF output to the web detail pane.
 *
 * The parity test imports the web-side getVisibleFields (from
 * packages/web/src/lib/form-render.ts) against the same fixture+response and
 * asserts deep equality with the server-side output here. If the two drift,
 * the test fires with a clear diff instead of a subtle rendering mismatch.
 */
export interface VisibleField {
  name: string;
  label: string;
  value: string;
}

export interface VisibleFieldRow extends VisibleField {
  kind: 'field';
}

export interface VisibleAddressBlock {
  kind: 'address';
  name: 'legalAddress';
  label: string;
  value: string;
  fields: VisibleField[];
}

export type VisiblePdfRow = VisibleFieldRow | VisibleAddressBlock;

export interface VisiblePdfSection {
  title: string;
  rows: VisiblePdfRow[];
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 20, fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontSize: 14, marginTop: 16, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  fieldRow: { marginBottom: 6 },
  fieldLabel: { fontSize: 9, color: '#666', marginBottom: 2 },
  fieldValue: { fontSize: 11 },
  addressLine: { fontSize: 11, marginBottom: 2 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
});

const LEGAL_ADDRESS_FIELD_NAMES = new Set([
  'legalStreetAddress',
  'legalCity',
  'legalPostalCode',
  'legalStateProvince',
  'legalCountry',
]);

function isFieldVisible(field: FormFieldDef, data: Record<string, unknown>): boolean {
  if (!field.conditionalOn) return true;
  return data[field.conditionalOn.field] === field.conditionalOn.value;
}

/**
 * Walks formDef.sections in order, filters fields by their conditionalOn
 * against the response data, and returns the canonical (label, value) list
 * the UI/PDF should render. Shared with the web walker so the two surfaces
 * cannot drift silently. See {@link VisibleField}.
 */
export function getVisibleFields(
  formDef: FormDef,
  data: Record<string, unknown>
): VisibleField[] {
  const out: VisibleField[] = [];
  for (const section of formDef.sections) {
    for (const field of section.fields) {
      if (!isFieldVisible(field, data)) continue;
      out.push({
        name: field.name,
        label: field.label,
        value: formatValue(data[field.name], field.type),
      });
    }
  }
  return out;
}

export function getVisiblePdfSections(
  formDef: FormDef,
  data: Record<string, unknown>
): VisiblePdfSection[] {
  const sections: VisiblePdfSection[] = [];

  for (const section of formDef.sections) {
    const visibleFields = section.fields.filter((f) => isFieldVisible(f, data));
    const addressBlock = buildLegalAddressBlock(visibleFields, data);
    const rows: VisiblePdfRow[] = [];

    if (addressBlock) rows.push(addressBlock);

    for (const field of visibleFields) {
      if (addressBlock && LEGAL_ADDRESS_FIELD_NAMES.has(field.name)) continue;
      rows.push({
        kind: 'field',
        name: field.name,
        label: field.label,
        value: formatValue(data[field.name], field.type),
      });
    }

    if (rows.length > 0) {
      sections.push({ title: section.title, rows });
    }
  }

  return sections;
}

function buildLegalAddressBlock(
  fields: FormFieldDef[],
  data: Record<string, unknown>
): VisibleAddressBlock | null {
  const legalFields = fields.filter((field) => LEGAL_ADDRESS_FIELD_NAMES.has(field.name));
  if (legalFields.length === 0) return null;

  const fieldByName = new Map(legalFields.map((field) => [field.name, field]));
  const formatted = (name: string) => {
    const field = fieldByName.get(name);
    if (!field) return '';
    const value = formatValue(data[name], field.type);
    return value === '—' ? '' : value;
  };

  const street = formatted('legalStreetAddress');
  const city = formatted('legalCity');
  const postalCode = formatted('legalPostalCode');
  const stateProvince = formatted('legalStateProvince');
  const country = formatted('legalCountry');

  const cityLine = [city, postalCode].filter(Boolean).join(', ');
  const lines = [street, cityLine, stateProvince, country].filter(Boolean);
  if (lines.length === 0) return null;

  return {
    kind: 'address',
    name: 'legalAddress',
    label: 'Legal address',
    value: lines.join('\n'),
    fields: legalFields.map((field) => ({
      name: field.name,
      label: field.label,
      value: formatValue(data[field.name], field.type),
    })),
  };
}

/**
 * Format a single response value for rendering. Explicit rule table to avoid
 * coercion bugs (notably: `0` must render as "0", not "—"; `false` renders
 * as "No", not "—"). Kept intentionally in lockstep with the web walker at
 * packages/web/src/lib/form-render.ts#formatValue — a shared fixture parity
 * test pins them together.
 *
 *   null / undefined / "" / []                  → "—"
 *   boolean                                     → "Yes" / "No"
 *   field.type === 'date' (YYYY-MM-DD string)   → "D MMM YYYY" (local, no TZ shift)
 *   non-empty array                             → arr.join(", ")
 *   object                                      → JSON.stringify(value)
 *   anything else                               → String(value)
 */
function formatValue(value: unknown, fieldType?: FormFieldDef['type']): string {
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
    // Stringify is defensive here — a form value should never be a plain
    // object (zod validates flat shapes at submit time). But stored data
    // predates that validation and could contain anything. Catch cyclic
    // structures so they don't crash the PDF render.
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
 * `new Date("YYYY-MM-DD")` UTC-midnight interpretation that shifts by one
 * day in UTC- timezones. Rejects impossible calendar dates (e.g. 2026-02-31,
 * 2025-02-29) by constructing a local Date from the parts and confirming
 * the Date's own y/m/d round-trips identically — Date auto-rolls 2026-02-31
 * into 2026-03-03, which we detect here. Returns the input unchanged on
 * any failure.
 */
function formatDateOnly(s: string): string {
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

function FormDocument({ formDef, data }: { formDef: FormDef; data: Record<string, unknown> }) {
  const sections = getVisiblePdfSections(formDef, data);

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, formDef.title),
      ...sections.map((section, si) => {
        return React.createElement(View, { key: si },
          React.createElement(Text, { style: styles.sectionTitle }, section.title),
          ...section.rows.map((row, ri) =>
            row.kind === 'address'
              ? React.createElement(View, { key: ri, style: styles.fieldRow },
                React.createElement(Text, { style: styles.fieldLabel }, row.label),
                ...row.value.split('\n').map((line, lineIndex) =>
                  React.createElement(Text, { key: lineIndex, style: styles.addressLine }, line)
                )
              )
              : React.createElement(View, { key: ri, style: styles.fieldRow },
                React.createElement(Text, { style: styles.fieldLabel }, row.label),
                React.createElement(Text, { style: styles.fieldValue }, row.value),
              )
          ),
        );
      }),
      React.createElement(Text, { style: styles.footer },
        `Generated by I Tatti Profile Portal — ${new Date().toISOString().split('T')[0]}`
      ),
    )
  );
}

export async function generateFormPdf(
  formDef: FormDef,
  data: Record<string, unknown>
): Promise<Buffer> {
  const element = React.createElement(FormDocument, { formDef, data }) as any;
  const stream = await ReactPDF.renderToStream(element);

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
