export interface CiviCRMErrorResult {
  status: number;
  message: string;
  code: string;
}

const KNOWN_PATTERNS: Array<{ pattern: RegExp; message: string; code: string }> = [
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

export function parseCiviCRMError(err: unknown, fallbackMessage: string): CiviCRMErrorResult {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes('AbortError') || raw.includes('timeout')) {
    return { status: 503, message: 'CiviCRM is temporarily unavailable. Please try again in a moment.', code: 'CIVICRM_TIMEOUT' };
  }

  for (const { pattern, message, code } of KNOWN_PATTERNS) {
    if (pattern.test(raw)) {
      return { status: 400, message, code };
    }
  }

  return { status: 503, message: fallbackMessage, code: 'CIVICRM_UNAVAILABLE' };
}
