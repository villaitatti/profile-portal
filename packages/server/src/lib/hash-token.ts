import { createHash } from 'crypto';

/**
 * Full sha256 hex digest for bearer-token storage. Form-invitation tokens are
 * persisted only as this hash, so a leaked database backup cannot be replayed
 * as live form links; the raw token exists solely in the generated link/email.
 * Unlike hashEmail (a 12-char correlation prefix), lookups need the complete
 * digest so the hash stays as collision-free as the token itself.
 *
 * Must remain byte-identical to the in-place conversion in migration
 * 20260903120000_hash_form_invitation_tokens:
 *   encode(digest("token", 'sha256'), 'hex')
 * (pinned by the pgcrypto-parity integration test in database.test.ts).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
