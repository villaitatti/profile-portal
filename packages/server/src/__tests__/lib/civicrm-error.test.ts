import { describe, it, expect, vi } from 'vitest';

vi.mock('../../env.js', () => ({
  env: { CIVICRM_BASE_URL: 'https://civi.test', CIVICRM_API_KEY: 'k' },
  isDevMode: false,
}));

import { parseCiviCRMError } from '../../lib/civicrm-error.js';
import { CiviCRMApiError } from '../../lib/civicrm-client.js';

const FALLBACK = 'CiviCRM is temporarily unavailable.';

describe('parseCiviCRMError', () => {
  // Regression: an earlier version classified EVERY unknown error as 503
  // CIVICRM_UNAVAILABLE, so a deterministic local bug (TypeError, broken
  // import) presented to users as a permanent "try again in a moment" outage.
  it('maps a local (non-CiviCRM) error to 500 INTERNAL_ERROR', () => {
    const result = parseCiviCRMError(new TypeError('x is not a function'), FALLBACK);

    expect(result).toEqual({
      status: 500,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });

  // Regression: the /not found/i substring used to match arbitrary local error
  // messages and report them as a CiviCRM 404.
  it('does not let a local "not found" message hijack the 404 mapping', () => {
    const result = parseCiviCRMError(new Error('module not found: ./oops.js'), FALLBACK);

    expect(result.status).toBe(500);
    expect(result.code).toBe('INTERNAL_ERROR');
  });

  it('maps a CiviCRM duplicate-entry error to 400 DUPLICATE_ENTRY', () => {
    const result = parseCiviCRMError(
      new CiviCRMApiError('CiviCRM API error: DB Error: Duplicate entry for key email'),
      FALLBACK
    );

    expect(result.status).toBe(400);
    expect(result.code).toBe('DUPLICATE_ENTRY');
  });

  it('maps a CiviCRM not-found error to 404 NOT_FOUND', () => {
    const result = parseCiviCRMError(
      new CiviCRMApiError('CiviCRM API error: Address id 9 not found'),
      FALLBACK
    );

    expect(result.status).toBe(404);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('maps a timeout (via cause name) to 503 CIVICRM_TIMEOUT', () => {
    const cause = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    });
    const result = parseCiviCRMError(
      new CiviCRMApiError('CiviCRM request failed: The operation was aborted', {
        transport: true,
        cause,
      }),
      FALLBACK
    );

    expect(result.status).toBe(503);
    expect(result.code).toBe('CIVICRM_TIMEOUT');
  });

  it('maps an unrecognised CiviCRM API error to 503 with the fallback message', () => {
    const result = parseCiviCRMError(
      new CiviCRMApiError('CiviCRM API error: something new and strange'),
      FALLBACK
    );

    expect(result).toEqual({ status: 503, message: FALLBACK, code: 'CIVICRM_UNAVAILABLE' });
  });

  it('maps a transport failure to 503', () => {
    const result = parseCiviCRMError(
      new CiviCRMApiError('CiviCRM request failed: fetch failed', {
        transport: true,
        cause: new TypeError('fetch failed'),
      }),
      FALLBACK
    );

    expect(result.status).toBe(503);
  });
});
