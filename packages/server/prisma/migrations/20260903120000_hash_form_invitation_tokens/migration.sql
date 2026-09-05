-- Store form-invitation bearer tokens hashed (sha256 hex) instead of in
-- plaintext. Tokens are the sole credential for the unauthenticated
-- /api/forms/:token endpoints, and pending invitations live up to 180 days —
-- a leaked backup used to yield a valid bearer URL for every one of them.
--
-- The in-place UPDATE preserves existing pending invitations: the links
-- already emailed to appointees keep working because the server now hashes the
-- presented token before lookup (src/lib/hash-token.ts). The pgcrypto digest
-- below must stay byte-identical to Node's
-- createHash('sha256').update(token).digest('hex') — both consume UTF-8 and
-- emit lowercase hex (pinned by the parity test in
-- src/__tests__/integration/database.test.ts).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "form_invitations" RENAME COLUMN "token" TO "token_hash";

UPDATE "form_invitations"
SET "token_hash" = encode(digest("token_hash", 'sha256'), 'hex');

-- Keep the unique index name aligned with what Prisma generates for the
-- renamed field, so a future `migrate diff` stays clean.
ALTER INDEX "form_invitations_token_key" RENAME TO "form_invitations_token_hash_key";
