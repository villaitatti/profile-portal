-- Rekey appointee_email_events from (contact_id, academic_year, email_type)
-- to (fellowship_id, email_type). Rationale: the business invariant "one
-- fellowship per contact per year" is CiviCRM policy, not a schema constraint.
-- Codex review (2026-04-23) flagged that an upstream data-entry error could
-- silently collapse two fellowships into one lifecycle if we kept the old key.
--
-- Data migration:
-- As of 2026-04-23 the events table has zero rows in production (it was
-- created 2026-04-17 and no bio-email cron has been enabled in prod yet).
-- Staging and local dev environments may have a small number of test rows;
-- those are disposable. This migration TRUNCATES the table to establish the
-- new (fellowship_id, email_type) invariant cleanly.
--
-- If this migration ever needs to run against a non-empty production table,
-- pause and backfill fellowship_id via a CiviCRM lookup script FIRST, then
-- run a modified version of this migration that skips the TRUNCATE.

-- 1. Clear existing rows (safe per above — no production data).
TRUNCATE TABLE "appointee_email_events";

-- 2. Add fellowship_id as NOT NULL (safe after truncate).
ALTER TABLE "appointee_email_events"
  ADD COLUMN "fellowship_id" INTEGER NOT NULL;

-- 3. Drop the old composite unique index.
ALTER TABLE "appointee_email_events"
  DROP CONSTRAINT "appointee_email_events_contact_id_academic_year_email_type_key";

-- 4. Drop the old contact_id-only index (we create a composite below).
DROP INDEX "appointee_email_events_contact_id_idx";

-- 5. New unique index on (fellowship_id, email_type).
CREATE UNIQUE INDEX "appointee_email_events_fellowship_id_email_type_key"
  ON "appointee_email_events" ("fellowship_id", "email_type");

-- 6. Audit-scan index on (contact_id, academic_year).
CREATE INDEX "appointee_email_events_contact_id_academic_year_idx"
  ON "appointee_email_events" ("contact_id", "academic_year");
