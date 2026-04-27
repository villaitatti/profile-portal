-- Preserve appointee email resend/retry history.
--
-- Previously appointee_email_events had a unique key on
-- (fellowship_id, email_type), forcing the manual resend/retry path to delete
-- the old row before creating a new one. That loses audit history and blocks
-- the planned "email sent log" page.
--
-- New invariant:
--   - multiple historical rows per (fellowship_id, email_type) are allowed
--   - at most one in-flight row (PENDING/SENDING) may exist per pair
--   - dashboard queries use the latest row by created_at/id

-- Prisma deploy runs this migration transactionally in our Docker startup path,
-- so CONCURRENTLY cannot be used here.
CREATE UNIQUE INDEX IF NOT EXISTS "appointee_email_events_one_in_flight_per_fellowship_type"
  ON "appointee_email_events" ("fellowship_id", "email_type")
  WHERE "status" IN ('PENDING', 'SENDING');

DROP INDEX IF EXISTS "appointee_email_events_fellowship_id_email_type_key";

CREATE INDEX IF NOT EXISTS "appointee_email_events_fellowship_id_email_type_created_at_idx"
  ON "appointee_email_events" ("fellowship_id", "email_type", "created_at" DESC);
