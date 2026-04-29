-- CreateTable
CREATE TABLE "form_invitations" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fellowship_id" INTEGER NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "academic_year" TEXT NOT NULL,
    "form_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "nomination_sent_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_responses" (
    "id" TEXT NOT NULL,
    "invitation_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_invitations_token_key" ON "form_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "form_invitations_fellowship_id_form_type_academic_year_key" ON "form_invitations"("fellowship_id", "form_type", "academic_year");

-- CreateIndex
CREATE INDEX "form_invitations_status_academic_year_idx" ON "form_invitations"("status", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "form_responses_invitation_id_key" ON "form_responses"("invitation_id");

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "form_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
