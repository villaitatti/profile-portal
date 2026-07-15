ALTER TABLE "form_invitations"
ADD COLUMN "expires_at" TIMESTAMP(3);

-- Preserve existing emailed links for at least another 30 days while still
-- placing a finite upper bound on their lifetime.
UPDATE "form_invitations"
SET "expires_at" = GREATEST(
  "created_at" + INTERVAL '180 days',
  CURRENT_TIMESTAMP + INTERVAL '30 days'
);

ALTER TABLE "form_invitations"
ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "form_invitations_status_expires_at_idx"
ON "form_invitations"("status", "expires_at");
