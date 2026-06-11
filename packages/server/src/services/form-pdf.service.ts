import ReactPDF from '@react-pdf/renderer';
import React from 'react';
import type { FormDef, FormFieldDef, FormPdfKind } from '@itatti/shared';

const { Document, Page, Text, View, StyleSheet } = ReactPDF;

export const FORM_PDF_KINDS = [
  { kind: 'memorandum', label: 'Memorandum' },
  { kind: 'grants-resources', label: 'Grant Information' },
] as const satisfies readonly { kind: FormPdfKind; label: string }[];

export interface FormPdfMetadata {
  appointeeName: string | null;
  academicYear: string;
  fellowshipType: string | null;
  appointment: string | null;
}

export interface FormPdfAttachment {
  kind?: FormPdfKind;
  label: string;
  buffer: Buffer;
}

/**
 * Canonical (label, value) pair that appears in the rendered form output.
 * Produced by {@link getVisibleFields}; consumed by archive/detail callers and
 * by the parity test that compares server-side field formatting to the web
 * detail pane.
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

export interface VisibleRepeatableGroup {
  kind: 'repeatableGroup';
  name: string;
  label: string;
  itemLabel: string;
  value: string;
  items: VisibleField[][];
}

export type VisiblePdfRow = VisibleFieldRow | VisibleAddressBlock | VisibleRepeatableGroup;

export interface VisiblePdfSection {
  title: string;
  rows: VisiblePdfRow[];
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 12, fontFamily: 'Helvetica-Bold' },
  metadata: {
    borderBottomWidth: 1,
    borderBottomColor: '#d7d2ca',
    paddingBottom: 10,
    marginBottom: 8,
  },
  metadataRow: { flexDirection: 'row', marginBottom: 3 },
  metadataLabel: { width: 92, fontSize: 8.5, color: '#666', fontFamily: 'Helvetica-Bold' },
  metadataValue: { flex: 1, fontSize: 9.5 },
  sectionTitle: { fontSize: 14, marginTop: 16, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  fieldRow: { marginBottom: 6 },
  fieldLabel: { fontSize: 9, color: '#666', marginBottom: 2 },
  fieldValue: { fontSize: 11 },
  addressLine: { fontSize: 11, marginBottom: 2 },
  groupItem: { marginTop: 4, marginBottom: 6, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: '#d7d2ca' },
  groupItemTitle: { fontSize: 9.5, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
});

const LEGAL_ADDRESS_FIELD_NAMES = new Set([
  'legalStreetAddress',
  'legalSupplementalAddress',
  'legalCity',
  'legalPostalCode',
  'legalStateProvince',
  'legalCountry',
]);

const PDF_SECTION_TITLES: Record<FormPdfKind, Set<string>> = {
  memorandum: new Set(['Personal Information', 'Legal Address', 'Family', 'Emergency Contact']),
  'grants-resources': new Set(['Grants & Resources', 'Grant Information']),
};

function pdfKindLabel(kind: FormPdfKind): string {
  return FORM_PDF_KINDS.find((item) => item.kind === kind)?.label ?? kind;
}

export function getFormPdfKindLabel(formDef: FormDef, kind: FormPdfKind): string {
  if (kind === 'grants-resources') {
    const sectionTitle = formDef.sections.find((section) =>
      PDF_SECTION_TITLES[kind].has(section.title)
    )?.title;
    if (sectionTitle) return sectionTitle;
  }

  return pdfKindLabel(kind);
}

function isFieldVisible(field: FormFieldDef, data: Record<string, unknown>): boolean {
  if (!field.conditionalOn) return true;
  return data[field.conditionalOn.field] === field.conditionalOn.value;
}

function isDataField(field: FormFieldDef): boolean {
  return field.type !== 'subheader';
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

export function getVisiblePdfSections(
  formDef: FormDef,
  data: Record<string, unknown>,
  kind?: FormPdfKind
): VisiblePdfSection[] {
  const sections: VisiblePdfSection[] = [];
  const sectionTitles = kind ? getPdfSectionTitles(formDef, kind) : null;

  for (const section of formDef.sections) {
    if (sectionTitles && !sectionTitles.has(section.title)) continue;

    const visibleFields = section.fields
      .filter((f) => isFieldVisible(f, data))
      .filter(isDataField);
    const addressBlock = buildLegalAddressBlock(visibleFields, data);
    const rows: VisiblePdfRow[] = [];

    if (addressBlock) rows.push(addressBlock);

    for (const field of visibleFields) {
      if (addressBlock && LEGAL_ADDRESS_FIELD_NAMES.has(field.name)) continue;
      if (field.type === 'repeatable-group') {
        rows.push(buildRepeatableGroupRow(field, data));
        continue;
      }
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

function getPdfSectionTitles(formDef: FormDef, kind: FormPdfKind): Set<string> | null {
  if (!formDef.pdfKinds?.includes(kind)) return null;
  return PDF_SECTION_TITLES[kind];
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
  const supplemental = formatted('legalSupplementalAddress');
  const city = formatted('legalCity');
  const postalCode = formatted('legalPostalCode');
  const stateProvince = formatted('legalStateProvince');
  const country = formatted('legalCountry');

  const cityLine = [city, postalCode].filter(Boolean).join(', ');
  const lines = [street, supplemental, cityLine, stateProvince, country].filter(Boolean);
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

function buildRepeatableGroupRow(
  field: FormFieldDef,
  data: Record<string, unknown>
): VisibleRepeatableGroup {
  const value = data[field.name];
  const childFields = field.fields?.filter(isDataField) ?? [];
  const items = Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => {
          return !!item && typeof item === 'object' && !Array.isArray(item);
        })
        .map((item) =>
          childFields.map((childField) => ({
            name: childField.name,
            label: childField.label,
            value: formatValue(item[childField.name], childField.type),
          }))
        )
    : [];

  return {
    kind: 'repeatableGroup',
    name: field.name,
    label: field.label,
    itemLabel: field.itemLabel ?? 'Entry',
    value: formatRepeatableGroupValue(value, field),
    items,
  };
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
 * Format a single response value for rendering. Explicit rule table to avoid
 * coercion bugs (notably: `0` must render as "0", not "—"; `false` renders
 * as "No", not "—"). Kept intentionally in lockstep with the web walker at
 * packages/web/src/lib/form-render.ts#formatValue.
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
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
  return String(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function FormDocument({
  formDef,
  data,
  kind,
  metadata,
}: {
  formDef: FormDef;
  data: Record<string, unknown>;
  kind?: FormPdfKind;
  metadata?: FormPdfMetadata;
}) {
  const sections = getVisiblePdfSections(formDef, data, kind);
  const title = kind ? `${getFormPdfKindLabel(formDef, kind)} - ${formDef.title}` : formDef.title;

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, title),
      metadata
        ? React.createElement(View, { style: styles.metadata },
          ...metadataRows(metadata).map(([label, value]) =>
            React.createElement(View, { key: label, style: styles.metadataRow },
              React.createElement(Text, { style: styles.metadataLabel }, label),
              React.createElement(Text, { style: styles.metadataValue }, value || '—'),
            )
          ),
        )
        : null,
      ...sections.map((section, si) => {
        return React.createElement(View, { key: si },
          React.createElement(Text, { style: styles.sectionTitle }, section.title),
          ...section.rows.map((row, ri) => renderPdfRow(row, ri)),
        );
      }),
      React.createElement(Text, { style: styles.footer },
        `Generated by I Tatti Profile Portal - ${new Date().toISOString().split('T')[0]}`
      ),
    )
  );
}

function metadataRows(metadata: FormPdfMetadata): [string, string | null][] {
  const rows: [string, string | null][] = [
    ['Full name', metadata.appointeeName],
    ['Academic year', metadata.academicYear],
    ['Fellowship type', metadata.fellowshipType],
  ];
  if (metadata.appointment) rows.push(['Appointment', metadata.appointment]);
  return rows;
}

function renderPdfRow(row: VisiblePdfRow, key: number) {
  if (row.kind === 'address') {
    return React.createElement(View, { key, style: styles.fieldRow },
      React.createElement(Text, { style: styles.fieldLabel }, row.label),
      ...row.value.split('\n').map((line, lineIndex) =>
        React.createElement(Text, { key: lineIndex, style: styles.addressLine }, line)
      )
    );
  }

  if (row.kind === 'repeatableGroup') {
    return React.createElement(View, { key, style: styles.fieldRow },
      React.createElement(Text, { style: styles.fieldLabel }, row.label),
      row.items.length === 0
        ? React.createElement(Text, { style: styles.fieldValue }, '—')
        : row.items.map((item, itemIndex) =>
          React.createElement(View, { key: itemIndex, style: styles.groupItem },
            React.createElement(Text, { style: styles.groupItemTitle }, `${row.itemLabel} ${itemIndex + 1}`),
            ...item.map((field) =>
              React.createElement(Text, { key: field.name, style: styles.fieldValue },
                `${field.label}: ${field.value}`
              )
            )
          )
        )
    );
  }

  return React.createElement(View, { key, style: styles.fieldRow },
    React.createElement(Text, { style: styles.fieldLabel }, row.label),
    React.createElement(Text, { style: styles.fieldValue }, row.value),
  );
}

export async function generateFormPdf(
  formDef: FormDef,
  data: Record<string, unknown>,
  options?: { kind?: FormPdfKind; metadata?: FormPdfMetadata }
): Promise<Buffer> {
  const element = React.createElement(FormDocument, {
    formDef,
    data,
    kind: options?.kind,
    metadata: options?.metadata,
  }) as any;
  const stream = await ReactPDF.renderToStream(element);

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function generateFormPdfAttachments(
  formDef: FormDef,
  data: Record<string, unknown>,
  metadata: FormPdfMetadata
): Promise<FormPdfAttachment[]> {
  const pdfKinds = FORM_PDF_KINDS.filter(({ kind }) => formDef.pdfKinds?.includes(kind));
  if (pdfKinds.length === 0) {
    return [
      {
        label: 'Submission',
        buffer: await generateFormPdf(formDef, data, { metadata }),
      },
    ];
  }

  return Promise.all(
    pdfKinds.map(async ({ kind }) => ({
      kind,
      label: getFormPdfKindLabel(formDef, kind),
      buffer: await generateFormPdf(formDef, data, { kind, metadata }),
    }))
  );
}
