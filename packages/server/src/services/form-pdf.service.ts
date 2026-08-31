import ReactPDF from '@react-pdf/renderer';
import React from 'react';
import type { FormDef, FormFieldDef, FormPdfKind, VisibleField } from '@itatti/shared';
import {
  formatRepeatableGroupValue,
  formatValue,
  getVisibleFields,
  isDataField,
  isFieldVisible,
} from '@itatti/shared';

// The display walker (visibility filtering + value formatting) lives in
// @itatti/shared/form-render — one implementation for PDF and web. This
// module keeps only the PDF-specific layout: section selection per pdfKind,
// the legal-address block, inline row grouping, and the ReactPDF document.
export { getVisibleFields };
export type { VisibleField };

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
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica' },
  title: { fontSize: 16, marginBottom: 10, fontFamily: 'Helvetica-Bold' },
  metadata: {
    borderBottomWidth: 1,
    borderBottomColor: '#d7d2ca',
    paddingBottom: 8,
    marginBottom: 6,
  },
  metadataRow: { flexDirection: 'row', marginBottom: 3 },
  metadataLabel: { width: 92, fontSize: 8.5, color: '#666', fontFamily: 'Helvetica-Bold' },
  metadataValue: { flex: 1, fontSize: 9.5 },
  sectionTitle: { fontSize: 12.5, marginTop: 12, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  fieldRow: { marginBottom: 5 },
  // Horizontal pair/triple of fields, kept on one line to compact the memorandum.
  inlineRow: { flexDirection: 'row', marginBottom: 5, gap: 16 },
  inlineCell: { flex: 1 },
  fieldLabel: { fontSize: 9, color: '#666', marginBottom: 2 },
  fieldValue: { fontSize: 11 },
  addressLine: { fontSize: 11, marginBottom: 2 },
  groupItem: { marginTop: 4, marginBottom: 6, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: '#d7d2ca' },
  groupItemTitle: { fontSize: 9.5, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 8, color: '#999', textAlign: 'center' },
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

/**
 * Groups of simple `field` rows that should render side-by-side on a single
 * PDF line instead of stacked. This is a pure layout concern — the visible
 * field model (and the cross-surface parity test) is untouched. Each group is
 * an ordered set of field names; adjacent field rows whose names belong to the
 * same group are merged into one inline row. Fields not in any group (or that
 * fall between group members, e.g. the conditional `statusOther`) render on
 * their own line as before. Defined to keep the Memorandum on one page.
 */
const INLINE_FIELD_GROUPS: string[][] = [
  ['title', 'givenName', 'surname'],
  ['hasUsSsn', 'statusAtItatti'],
  ['nationality', 'secondNationality'],
  ['emergencyName', 'emergencyRelationship'],
  ['emergencyPhone', 'emergencyEmail'],
];

export interface InlinePdfRow {
  kind: 'inline';
  cells: VisibleFieldRow[];
}

export type RenderUnit = VisiblePdfRow | InlinePdfRow;

function inlineGroupFor(name: string): string[] | undefined {
  return INLINE_FIELD_GROUPS.find((group) => group.includes(name));
}

/**
 * Walk a section's rows and merge consecutive simple-field rows that belong to
 * the same {@link INLINE_FIELD_GROUPS} group into a single {@link InlinePdfRow}.
 * Address/repeatable-group rows always stand alone.
 */
export function groupRowsForLayout(rows: VisiblePdfRow[]): RenderUnit[] {
  const units: RenderUnit[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const group = row.kind === 'field' ? inlineGroupFor(row.name) : undefined;
    if (row.kind !== 'field' || !group) {
      units.push(row);
      continue;
    }

    const cells: VisibleFieldRow[] = [row];
    while (i + 1 < rows.length) {
      const next = rows[i + 1];
      if (next.kind !== 'field' || !group.includes(next.name)) break;
      cells.push(next);
      i += 1;
    }

    units.push(cells.length > 1 ? { kind: 'inline', cells } : row);
  }
  return units;
}

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
          ...groupRowsForLayout(section.rows).map((unit, ri) => renderRenderUnit(unit, ri)),
        );
      }),
      // `fixed` paints the footer as a page overlay so it pins to the bottom of
      // every page without being treated as flow content — otherwise a memorandum
      // whose fields fill the page pushes this absolutely-positioned footer onto a
      // near-empty second page.
      React.createElement(Text, { style: styles.footer, fixed: true },
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

function renderRenderUnit(unit: RenderUnit, key: number) {
  if (unit.kind === 'inline') {
    return React.createElement(View, { key, style: styles.inlineRow },
      ...unit.cells.map((cell) =>
        React.createElement(View, { key: cell.name, style: styles.inlineCell },
          React.createElement(Text, { style: styles.fieldLabel }, cell.label),
          React.createElement(Text, { style: styles.fieldValue }, cell.value),
        )
      )
    );
  }
  return renderPdfRow(unit, key);
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
  });
  // react-pdf's renderToStream expects its own Document element type, which
  // React 19's createElement typing can't express — bridge via the function's
  // declared parameter type instead of `any`.
  const stream = await ReactPDF.renderToStream(
    element as unknown as Parameters<typeof ReactPDF.renderToStream>[0]
  );

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
