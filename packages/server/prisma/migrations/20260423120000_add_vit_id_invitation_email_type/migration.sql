-- Add VIT_ID_INVITATION to the appointee_email_type enum.
-- Postgres requires enum-value additions to run in their own migration —
-- they cannot be committed in the same transaction that references the
-- new value. That's why the rekey lives in a separate migration that
-- runs immediately after this one.
ALTER TYPE "appointee_email_type" ADD VALUE IF NOT EXISTS 'VIT_ID_INVITATION';
