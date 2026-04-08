-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "dry_run_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "diff" JSONB NOT NULL,
    "result" JSONB,
    "stats" JSONB,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_group_mappings" (
    "id" TEXT NOT NULL,
    "auth0_role_id" TEXT NOT NULL,
    "auth0_role_name" TEXT NOT NULL,
    "atlassian_group_id" TEXT,
    "atlassian_group_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_group_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_group_mappings_auth0_role_id_atlassian_group_id_key" ON "role_group_mappings"("auth0_role_id", "atlassian_group_id");

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_dry_run_id_fkey" FOREIGN KEY ("dry_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
