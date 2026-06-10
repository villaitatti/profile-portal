import { describe, it, expect } from 'vitest';
import {
  generateFormPdf,
  generateFormPdfAttachments,
  getVisibleFields,
  getVisiblePdfSections,
} from '../../services/form-pdf.service.js';
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
    expect(grantsSections.map((section) => section.title)).toEqual(['Grants & Resources']);
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
