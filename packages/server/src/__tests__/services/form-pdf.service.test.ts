import { describe, it, expect } from 'vitest';
import { getVisibleFields, getVisiblePdfSections } from '../../services/form-pdf.service.js';
import {
  getFormDef,
  parityFormDef,
  parityResponseData,
  parityExpectedFields,
} from '@itatti/shared';

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
});
