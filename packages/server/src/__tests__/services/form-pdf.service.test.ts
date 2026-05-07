import { describe, it, expect } from 'vitest';
import { getVisibleFields } from '../../services/form-pdf.service.js';
import {
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
});
