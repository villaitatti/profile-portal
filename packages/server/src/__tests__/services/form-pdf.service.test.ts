import { describe, it, expect } from 'vitest';
import {
  generateFormPdf,
  generateFormPdfAttachments,
  getFormPdfKindLabel,
  getVisibleFields,
  getVisiblePdfSections,
  groupRowsForLayout,
} from '../../services/form-pdf.service.js';
import type { VisiblePdfRow } from '../../services/form-pdf.service.js';
import {
  getFormDef,
  parityFormDef,
  parityResponseData,
  parityExpectedFields,
} from '@itatti/shared';
import type { FormDef } from '@itatti/shared';

describe('form-pdf.service getVisibleFields — parity fixture', () => {
  // This test pins the PDF renderer's visible-field logic to the shared
  // fixture. The web walker (packages/web/src/__tests__/lib/form-render.test.ts)
  // runs the same assertion against the same fixture. If either side drifts
  // from the other, both tests fire with the same expected diff — the design
  // intent is that the PDF Angela receives by email and the PDF she
  // downloads from the submissions archive render the same (label, value)
  // pairs for the same response.
  it('produces the expected canonical (label, value) list', () => {
    const out = getVisibleFields(parityFormDef, parityResponseData);
    expect(out).toEqual(parityExpectedFields);
  });

  it('omits fields whose conditionalOn gate does not match', () => {
    const out = getVisibleFields(parityFormDef, parityResponseData);
    const names = out.map((f) => f.name);
    expect(names).toContain('ssn');
    expect(names).not.toContain('nonResidentDetails');
  });

  it('flips visibility when the conditionalOn gate flips', () => {
    const data = { ...parityResponseData, hasSsn: 'No' };
    const out = getVisibleFields(parityFormDef, data);
    const names = out.map((f) => f.name);
    expect(names).not.toContain('ssn');
    expect(names).toContain('nonResidentDetails');
  });

  it('keeps legacy legalAddress submissions visible in the PDF model', () => {
    const formDef = getFormDef('fellow-memorandum');
    expect(formDef).toBeDefined();

    const sections = getVisiblePdfSections(formDef!, {
      title: 'Dr.',
      givenName: 'Maria',
      surname: 'Bianchi',
      email: 'maria@example.com',
      legalAddress: 'Via di Vincigliata 26\n50135 Florence\nItaly',
      countryMovingFrom: 'Italy',
      hasUsSsn: 'No',
      statusAtItatti: 'Independent Scholar',
      nationality: 'Italian',
      emergencyName: 'Luca Bianchi',
      emergencyPhone: '+39 055 0000',
      emergencyEmail: 'luca@example.com',
      resources: 'University leave letter attached.',
    });

    const personal = sections.find((section) => section.title === 'Personal Information');
    expect(personal?.rows).toContainEqual(
      expect.objectContaining({
        kind: 'field',
        name: 'legalAddress',
        value: 'Via di Vincigliata 26\n50135 Florence\nItaly',
      })
    );
  });

  it('renders v2 split legal-address fields as one coherent PDF address block', () => {
    const formDef = getFormDef('fellow-memorandum-v2');
    expect(formDef).toBeDefined();

    const sections = getVisiblePdfSections(formDef!, {
      givenName: 'Maria',
      surname: 'Bianchi',
      email: 'maria@example.com',
      legalStreetAddress: 'Via di Vincigliata 26',
      legalCity: 'Florence',
      legalPostalCode: '50135',
      legalStateProvince: 'FI',
      legalCountry: 'Italy',
      countryMovingFrom: 'Italy',
      hasUsSsn: 'No',
      statusAtItatti: 'Independent Scholar',
      nationality: 'Italian',
      emergencyName: 'Luca Bianchi',
      emergencyPhone: '+39 055 0000',
      emergencyEmail: 'luca@example.com',
      resources: 'University leave letter attached.',
    });

    const legalAddress = sections.find((section) => section.title === 'Legal Address');
    expect(legalAddress?.rows).toHaveLength(1);
    expect(legalAddress?.rows[0]).toMatchObject({
      kind: 'address',
      label: 'Legal address',
      value: 'Via di Vincigliata 26\nFlorence, 50135\nFI\nItaly',
      fields: [
        { name: 'legalStreetAddress', label: 'Street address', value: 'Via di Vincigliata 26' },
        { name: 'legalCity', label: 'City', value: 'Florence' },
        { name: 'legalPostalCode', label: 'Postal code', value: '50135' },
        { name: 'legalStateProvince', label: 'State / Province', value: 'FI' },
        { name: 'legalCountry', label: 'Country', value: 'Italy' },
      ],
    });
  });

  it('keeps retired v2 grants/resources PDF labels stable', async () => {
    const formDef = getFormDef('fellow-memorandum-v2');
    expect(formDef).toBeDefined();

    expect(getFormPdfKindLabel(formDef!, 'grants-resources')).toBe('Grants & Resources');

    const grantsSections = getVisiblePdfSections(formDef!, {}, 'grants-resources');
    expect(grantsSections.map((section) => section.title)).toEqual(['Grants & Resources']);

    const attachments = await generateFormPdfAttachments(
      formDef!,
      { resources: 'University leave letter attached.' },
      {
        appointeeName: 'Maria Bianchi',
        academicYear: '2026-2027',
        fellowshipType: null,
        appointment: null,
      }
    );

    expect(attachments.map(({ kind, label }) => ({ kind, label }))).toContainEqual({
      kind: 'grants-resources',
      label: 'Grants & Resources',
    });
  });

  it('uses the active v3 grant information label for split PDFs', () => {
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();

    expect(getFormPdfKindLabel(formDef!, 'grants-resources')).toBe('Grant Information');
  });

  it('renders v3 supplemental address between street and city in the PDF address block', () => {
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();

    const sections = getVisiblePdfSections(formDef!, {
      givenName: 'Maria',
      surname: 'Bianchi',
      email: 'maria@example.com',
      mobilePhone: '+39 333 0000',
      legalStreetAddress: 'Via di Vincigliata 26',
      legalSupplementalAddress: 'Villa I Tatti',
      legalCity: 'Florence',
      legalPostalCode: '50135',
      legalStateProvince: 'FI',
      legalCountry: 'Italy',
      countryMovingFrom: 'Italy',
      hasUsSsn: 'No',
      statusAtItatti: 'Independent Scholar',
      nationality: 'Italian',
      emergencyName: 'Luca Bianchi',
      emergencyPhone: '+39 055 0000',
      emergencyEmail: 'luca@example.com',
      resources: 'University leave letter attached.',
    });

    const legalAddress = sections.find((section) => section.title === 'Legal Address');
    expect(legalAddress?.rows[0]).toMatchObject({
      kind: 'address',
      label: 'Legal address',
      value: 'Via di Vincigliata 26\nVilla I Tatti\nFlorence, 50135\nFI\nItaly',
    });
  });

  it('formats repeatable children as structured PDF rows', () => {
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();

    const sections = getVisiblePdfSections(formDef!, {
      children: [
        {
          fullName: 'Giulia Bianchi',
          dateOfBirth: '2018-04-24',
          datesOfStay: 'September to December',
        },
      ],
    });

    const family = sections.find((section) => section.title === 'Family');
    const children = family?.rows.find((row) => row.kind === 'repeatableGroup');
    expect(children).toMatchObject({
      kind: 'repeatableGroup',
      label: 'Children',
      itemLabel: 'Child',
      value:
        'Child 1\nFull name: Giulia Bianchi\nDate of birth: 24 Apr 2018\nDates of stay: September to December',
      items: [
        [
          { name: 'fullName', label: 'Full name', value: 'Giulia Bianchi' },
          { name: 'dateOfBirth', label: 'Date of birth', value: '24 Apr 2018' },
          { name: 'datesOfStay', label: 'Dates of stay', value: 'September to December' },
        ],
      ],
    });
  });

  it('splits memorandum and grants/resources sections by PDF kind', () => {
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();

    const memorandumSections = getVisiblePdfSections(formDef!, {}, 'memorandum');
    const grantsSections = getVisiblePdfSections(formDef!, {}, 'grants-resources');

    expect(memorandumSections.map((section) => section.title)).toEqual([
      'Personal Information',
      'Legal Address',
      'Family',
      'Emergency Contact',
    ]);
    expect(grantsSections.map((section) => section.title)).toEqual(['Grant Information']);
  });

  it('splits all active term fellow forms into memorandum and grant information PDFs', () => {
    for (const formId of [
      'term-fellow-memorandum-v1',
      'dumbarton-oaks-fellow-memorandum-v1',
      'graduate-fellow-memorandum-v1',
    ]) {
      const formDef = getFormDef(formId);
      expect(formDef).toBeDefined();

      const memorandumSections = getVisiblePdfSections(formDef!, {}, 'memorandum');
      const grantsSections = getVisiblePdfSections(formDef!, {}, 'grants-resources');

      expect(memorandumSections.map((section) => section.title)).toEqual([
        'Personal Information',
        'Legal Address',
        'Family',
        'Emergency Contact',
      ]);
      expect(grantsSections.map((section) => section.title)).toEqual(['Grant Information']);
      expect(getFormPdfKindLabel(formDef!, 'grants-resources')).toBe('Grant Information');
    }
  });

  it('does not filter sections for forms that do not opt into split PDFs', () => {
    const formDef: FormDef = {
      id: 'generic-form',
      title: 'Generic Form',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Personal Information',
          fields: [
            { name: 'fullName', label: 'Full name', type: 'text', required: true },
          ],
        },
        {
          title: 'Grants & Resources',
          fields: [
            { name: 'resources', label: 'Resources', type: 'textarea', required: true },
          ],
        },
      ],
    };

    const sections = getVisiblePdfSections(
      formDef,
      { fullName: 'Maria Bianchi', resources: 'University leave letter attached.' },
      'memorandum'
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Personal Information',
      'Grants & Resources',
    ]);
  });

  it('falls back to one full submission attachment when a form has no split PDF kinds', async () => {
    const formDef: FormDef = {
      id: 'generic-form',
      title: 'Generic Form',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Personal Information',
          fields: [
            { name: 'fullName', label: 'Full name', type: 'text', required: true },
          ],
        },
        {
          title: 'Grants & Resources',
          fields: [
            { name: 'resources', label: 'Resources', type: 'textarea', required: true },
          ],
        },
      ],
    };

    const attachments = await generateFormPdfAttachments(
      formDef,
      { fullName: 'Maria Bianchi', resources: 'University leave letter attached.' },
      {
        appointeeName: 'Maria Bianchi',
        academicYear: '2026-2027',
        fellowshipType: null,
        appointment: null,
      }
    );

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ label: 'Submission' });
    expect(attachments[0].kind).toBeUndefined();
    expect(attachments[0].buffer.length).toBeGreaterThan(0);
  });

  it('groups title/given name/surname onto one inline PDF row', () => {
    const field = (name: string): VisiblePdfRow => ({
      kind: 'field',
      name,
      label: name,
      value: 'x',
    });

    const units = groupRowsForLayout([
      field('title'),
      field('givenName'),
      field('surname'),
      field('email'),
    ]);

    expect(units[0]).toMatchObject({
      kind: 'inline',
      cells: [
        { name: 'title' },
        { name: 'givenName' },
        { name: 'surname' },
      ],
    });
    expect(units[1]).toMatchObject({ kind: 'field', name: 'email' });
  });

  it('pairs the emergency-contact fields onto inline rows', () => {
    const field = (name: string): VisiblePdfRow => ({
      kind: 'field',
      name,
      label: name,
      value: 'x',
    });

    const units = groupRowsForLayout([
      field('emergencyName'),
      field('emergencyRelationship'),
      field('emergencyPhone'),
      field('emergencyEmail'),
    ]);

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      kind: 'inline',
      cells: [{ name: 'emergencyName' }, { name: 'emergencyRelationship' }],
    });
    expect(units[1]).toMatchObject({
      kind: 'inline',
      cells: [{ name: 'emergencyPhone' }, { name: 'emergencyEmail' }],
    });
  });

  it('pairs the SSN/status and nationality fields onto inline rows', () => {
    const field = (name: string): VisiblePdfRow => ({
      kind: 'field',
      name,
      label: name,
      value: 'x',
    });

    const units = groupRowsForLayout([
      field('hasUsSsn'),
      field('statusAtItatti'),
      field('nationality'),
      field('secondNationality'),
    ]);

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      kind: 'inline',
      cells: [{ name: 'hasUsSsn' }, { name: 'statusAtItatti' }],
    });
    expect(units[1]).toMatchObject({
      kind: 'inline',
      cells: [{ name: 'nationality' }, { name: 'secondNationality' }],
    });
  });

  it('keeps a lone grouped field (e.g. status without its pair) on its own row', () => {
    const units = groupRowsForLayout([
      { kind: 'field', name: 'statusAtItatti', label: 'Status', value: 'Other' },
      // statusOther sits between status and nationality and is not grouped, so
      // it stays on its own line and does not break the next inline pair.
      { kind: 'field', name: 'statusOther', label: 'If other', value: 'Visiting' },
      { kind: 'field', name: 'nationality', label: 'Nationality', value: 'Italian' },
    ]);

    expect(units).toEqual([
      { kind: 'field', name: 'statusAtItatti', label: 'Status', value: 'Other' },
      { kind: 'field', name: 'statusOther', label: 'If other', value: 'Visiting' },
      { kind: 'field', name: 'nationality', label: 'Nationality', value: 'Italian' },
    ]);
  });

  it('never merges address or repeatable-group rows into an inline row', () => {
    const units = groupRowsForLayout([
      { kind: 'address', name: 'legalAddress', label: 'Legal address', value: 'Street', fields: [] },
      {
        kind: 'repeatableGroup',
        name: 'children',
        label: 'Children',
        itemLabel: 'Child',
        value: '—',
        items: [],
      },
    ]);

    expect(units.every((unit) => unit.kind !== 'inline')).toBe(true);
  });

  it('returns an empty list for no rows', () => {
    expect(groupRowsForLayout([])).toEqual([]);
  });

  it('does not merge same-group members separated by an intervening field', () => {
    const field = (name: string): VisiblePdfRow => ({
      kind: 'field',
      name,
      label: name,
      value: 'x',
    });

    // givenName and surname share a group, but an ungrouped field between them
    // breaks the run — the while-loop stops, and surname falls back to a lone
    // field rather than starting a degenerate one-cell inline row.
    const units = groupRowsForLayout([
      field('givenName'),
      field('email'),
      field('surname'),
    ]);

    expect(units).toHaveLength(3);
    expect(units.every((unit) => unit.kind === 'field')).toBe(true);
  });

  it('keeps a full memorandum on a single page (fixed footer)', async () => {
    // The footer is `fixed` so it overlays each page instead of being treated
    // as flow content that pushes a near-empty second page. Guards against a
    // revert of `fixed: true` (or spacing regressions) silently re-introducing
    // the 2-page memorandum.
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();

    const pdf = await generateFormPdf(
      formDef!,
      {
        title: 'Dr.',
        givenName: 'Maria Elena',
        surname: 'Bianchi-Rossi',
        email: 'maria.bianchi@university.edu',
        mobilePhone: '+39 333 123 4567',
        countryMovingFrom: 'Italy',
        hasUsSsn: 'No',
        statusAtItatti: 'On sabbatical leave from university',
        nationality: 'Italian',
        secondNationality: 'British',
        dateOfBirth: '1980-05-14',
        legalStreetAddress: 'Via di Vincigliata 26',
        legalSupplementalAddress: 'Villa I Tatti, Department of Renaissance Studies',
        legalCity: 'Florence',
        legalPostalCode: '50135',
        legalStateProvince: 'FI',
        legalCountry: 'Italy',
        partnerName: 'Giovanni Rossi',
        partnerDatesOfStay: '1 September 2026 - 30 June 2027',
        children: [
          { fullName: 'Giulia Bianchi-Rossi', dateOfBirth: '2018-04-24', datesOfStay: 'September to December' },
          { fullName: 'Marco Bianchi-Rossi', dateOfBirth: '2020-11-02', datesOfStay: 'September to June' },
        ],
        emergencyName: 'Luca Bianchi',
        emergencyRelationship: 'Brother',
        emergencyPhone: '+39 055 000 0000',
        emergencyEmail: 'luca.bianchi@example.com',
      },
      {
        kind: 'memorandum',
        metadata: {
          appointeeName: 'Maria Elena Bianchi-Rossi',
          academicYear: '2026-2027',
          fellowshipType: 'Fellow',
          appointment: 'Research Fellow',
        },
      }
    );

    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBe(1);
  });

  it('renders split PDFs with metadata without throwing', async () => {
    const formDef = getFormDef('fellow-memorandum-v3');
    expect(formDef).toBeDefined();

    const pdf = await generateFormPdf(
      formDef!,
      {
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
      },
      {
        kind: 'memorandum',
        metadata: {
          appointeeName: 'Maria Bianchi',
          academicYear: '2026-2027',
          fellowshipType: 'Fellow',
          appointment: 'Research Fellow',
        },
      }
    );

    expect(pdf.length).toBeGreaterThan(0);
  });
});
