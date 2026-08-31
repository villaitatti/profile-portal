import { CiviCRMApiError } from './civicrm-client.js';

export interface CiviCRMErrorResult {
  status: number;
  message: string;
  code: string;
}

// Message patterns are matched ONLY against CiviCRMApiError messages (which
// embed CiviCRM's own error text), never against arbitrary local errors — a
// local "X was not found" TypeError must not be reported as a CiviCRM 404.
const KNOWN_PATTERNS: Array<{ pattern: RegExp; message: string; code: string; status?: number }> = [
  {
    pattern: /DB Error.*Duplicate entry/i,
    message: 'A record with this configuration already exists.',
    code: 'DUPLICATE_ENTRY',
  },
  {
    pattern: /already exists/i,
    message: 'This entry already exists. Please modify your input and try again.',
    code: 'DUPLICATE_ENTRY',
  },
  {
    pattern: /not found/i,
    message: 'The record was not found. It may have been deleted.',
    code: 'NOT_FOUND',
    status: 404,
  },
  {
    pattern: /permission|unauthorized|access denied/i,
    message: 'Permission denied. Please contact IT staff.',
    code: 'PERMISSION_DENIED',
  },
  {
    pattern: /required field|mandatory/i,
    message: 'A required field is missing. Please fill in all required fields.',
    code: 'VALIDATION_ERROR',
  },
];

/**
 * Maps an error caught around a CiviCRM operation to a client-facing response.
 *
 * Only CiviCRMApiError instances (thrown by lib/civicrm-client.ts) are treated
 * as upstream conditions. Everything else is a bug in our own code: it returns
 * 500 INTERNAL_ERROR with a generic message, because "temporarily unavailable,
 * please try again" is a lie for a deterministic failure — an earlier version
 * classified every unknown error as CIVICRM_UNAVAILABLE, which made local bugs
 * look like permanent outages. Callers are expected to log the raw error
 * before calling this.
 */
export function parseCiviCRMError(err: unknown, fallbackMessage: string): CiviCRMErrorResult {
  if (!(err instanceof CiviCRMApiError)) {
    return { status: 500, message: 'Internal server error', code: 'INTERNAL_ERROR' };
  }

  const causeName = (err.cause as { name?: string } | undefined)?.name;
  if (
    causeName === 'TimeoutError' ||
    causeName === 'AbortError' ||
    /timeout|AbortError/i.test(err.message)
  ) {
    return {
      status: 503,
      message: 'CiviCRM is temporarily unavailable. Please try again in a moment.',
      code: 'CIVICRM_TIMEOUT',
    };
  }

  for (const entry of KNOWN_PATTERNS) {
    if (entry.pattern.test(err.message)) {
      return { status: entry.status || 400, message: entry.message, code: entry.code };
    }
  }

  return { status: 503, message: fallbackMessage, code: 'CIVICRM_UNAVAILABLE' };
}
