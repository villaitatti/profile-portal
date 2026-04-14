-- CreateTable
CREATE TABLE "vit_id_claims" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "civicrm_id" INTEGER NOT NULL,
    "has_fellowship" BOOLEAN NOT NULL,
    "has_current_fellowship" BOOLEAN NOT NULL,
    "roles_assigned" TEXT[],
    "orgs_assigned" TEXT[],
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vit_id_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vit_id_claims_claimed_at_idx" ON "vit_id_claims"("claimed_at" DESC);
