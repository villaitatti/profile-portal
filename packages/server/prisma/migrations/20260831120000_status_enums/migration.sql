-- Convert closed-set workflow-state strings to real enum types, and enforce
-- the hyphenated automation type set with a CHECK constraint (hyphens cannot
-- be Prisma enum identifiers without changing the runtime strings).
--
-- Data mapping is the USING cast: any row holding a value outside the enum
-- makes the cast fail LOUDLY ("invalid input value for enum ..."), which is
-- the desired behavior — silent coercion would hide corrupt state.

CREATE TYPE "sync_run_status" AS ENUM ('dry_run', 'executing', 'completed', 'failed', 'partial');
CREATE TYPE "automation_run_status" AS ENUM ('dry_run', 'executing', 'completed', 'failed', 'partial');
CREATE TYPE "form_invitation_status" AS ENUM ('pending', 'submitted', 'expired');

ALTER TABLE "sync_runs"
  ALTER COLUMN "status" TYPE "sync_run_status" USING ("status"::"sync_run_status");

ALTER TABLE "automation_runs"
  ALTER COLUMN "status" TYPE "automation_run_status" USING ("status"::"automation_run_status");

ALTER TABLE "form_invitations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "form_invitations"
  ALTER COLUMN "status" TYPE "form_invitation_status" USING ("status"::"form_invitation_status");
ALTER TABLE "form_invitations" ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_type_check"
  CHECK ("type" IN ('end-of-year-cleanup', 'new-cohort-onboarding', 'backfill'));
