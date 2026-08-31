import { createHash } from 'crypto';

/**
 * Deterministic short hash for log correlation: the same email always yields
 * the same 12-hex-char token, so an incident can be traced across services
 * without the raw address ever landing in a log line. Single implementation —
 * this was previously copy-pasted in civicrm.service.ts and claim.service.ts,
 * relying on a comment to keep the two in sync.
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 12);
}
