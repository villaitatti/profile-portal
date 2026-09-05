-- Replay guard for automation execution: a dry_run row is atomically flipped
-- to 'consumed' when execution starts, so the same dry run can never be
-- executed twice (double-click / replayed POST of the same runId would
-- otherwise run the July automation twice concurrently against Auth0/JSM).
--
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new value
-- is not used in the same transaction — this migration only adds it.
ALTER TYPE "automation_run_status" ADD VALUE 'consumed';
