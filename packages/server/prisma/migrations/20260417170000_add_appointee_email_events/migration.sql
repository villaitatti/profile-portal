-- CreateEnum
CREATE TYPE "appointee_email_type" AS ENUM ('BIO_PROJECT_DESCRIPTION');

-- CreateEnum
CREATE TYPE "appointee_email_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "appointee_email_events" (
    "id" TEXT NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "academic_year" TEXT NOT NULL,
    "email_type" "appointee_email_type" NOT NULL,
    "status" "appointee_email_status" NOT NULL DEFAULT 'PENDING',
    "enqueued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_after" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "triggered_by" TEXT NOT NULL,
    "ses_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointee_email_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointee_email_events_contact_id_academic_year_email_type_key" ON "appointee_email_events"("contact_id", "academic_year", "email_type");

-- CreateIndex
CREATE INDEX "appointee_email_events_status_send_after_idx" ON "appointee_email_events"("status", "send_after");

-- CreateIndex
CREATE INDEX "appointee_email_events_contact_id_idx" ON "appointee_email_events"("contact_id");
