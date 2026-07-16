# Deployment

## Architecture

The Profile Portal runs as a single Docker image behind a Cloudflare Tunnel (cloudflared). GitHub Actions builds the image and publishes it to GitHub Container Registry. The app VM pulls that image and runs it with Docker Compose.

The container includes the Express API, the built React frontend, and runs Prisma migrations automatically on startup.

```
Internet → Cloudflare Tunnel → cloudflared container → portal container (Express)
                                                        ↓
                                                   PostgreSQL container
```

All containers share an internal Docker network. No host ports are exposed except through the tunnel.

## Dev Server

**Host:** `civicrm-dev` (also runs CiviCRM)
**Path:** `/opt/profile-portal`
**Network:** Shared `itatti-tunnel` Docker network for cloudflared access

### Deploy a new version

Normal dev deployment is automatic:

```bash
merge PR to main
# GitHub Actions builds ghcr.io/villaitatti/profile-portal:sha-<commit>
# GitHub Actions deploys that image to civicrm-dev
```

The server no longer needs `git pull` or `docker compose build` during normal deployment.

Manual emergency deployment, if GitHub Actions is unavailable:

```bash
cd /opt/profile-portal
export COMPOSE_PROJECT_NAME=profile-portal
export IMAGE_NAME=ghcr.io/villaitatti/profile-portal
export IMAGE_TAG=sha-<commit-sha>
export IMAGE_REF="$IMAGE_NAME:$IMAGE_TAG"
docker compose pull
docker compose up -d --remove-orphans
```

The `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the app, so database migrations are applied automatically on every restart.

## GitHub Actions Deployment

| Workflow | Runner | Trigger | Purpose |
|----------|--------|---------|---------|
| `CI` | GitHub-hosted | pull requests and pushes to `main` | Zero-warning lint, typecheck, tests, and a production build. |
| `Build image` | GitHub-hosted | pushes to `main`, version tags, manual | Build and push GHCR images. |
| `Deploy dev` | Internal self-hosted runner | successful `Build image` from `main`, or manual image tag | Deploy dev automatically from accepted `main` code. |
| `Deploy production` | Internal self-hosted runner | manual `workflow_dispatch` version tag | Create a DB backup, then deploy the selected release tag. |

Production deploys are intentionally manual and tag-based. Dev deploys are automatic from `main`.

Production accepts only exact `vMAJOR.MINOR.PATCH` tags matching the repository
`VERSION`. The workflow resolves the tag to an immutable commit, verifies that
the commit is on `main`, requires a successful push run of the exact CI workflow,
and deploys the immutable image digest whose OCI revision label matches that
commit. GitHub Actions are pinned to immutable commit SHAs.

### Production release gate

Before approving the `production` environment deployment:

1. Confirm CI and the version-tag image build both succeeded for the same commit.
2. Confirm the latest database backup exists and can be read by `pg_restore`/`psql`.
3. Confirm production `.env` does not enable `DEV_SKIP_EXTERNAL_SERVICES`,
   `PUBLIC_DEV_SKIP_AUTH`, `VITE_DEV_SKIP_AUTH`, or an email redirect.
4. Confirm `/api/health/ready` returns HTTP 200 in dev after the image is deployed.
5. Run the public-form, staff administration, and fellow profile smoke tests.
6. Record the previous image tag and the backup filename in the release notes.

### View logs

```bash
cd /opt/profile-portal
docker compose logs -f portal
```

### Restart without rebuilding

```bash
cd /opt/profile-portal
docker compose restart portal
```

### Roll to a different image tag

```bash
cd /opt/profile-portal
export COMPOSE_PROJECT_NAME=profile-portal
export IMAGE_NAME=ghcr.io/villaitatti/profile-portal
export IMAGE_TAG=sha-<commit-sha-or-version-tag>
export IMAGE_REF="$IMAGE_NAME:$IMAGE_TAG"
docker compose pull portal
docker compose up -d --remove-orphans
```

The deployment script automatically rolls the **portal application image** back
when the new container fails its internal readiness check or the configured
externally reachable health endpoint cannot be reached. It does not reverse
database migrations. If a migration is incompatible with the previous
application, use the migration-specific fix-forward path or restore the
pre-deploy database backup together with the previous image.

## Environment Variables

All configuration is in `.env` at the project root. See `.env.example` for the full list with comments.

### Required for the app to start

| Variable | Purpose |
|----------|---------|
| `DB_PASSWORD` | Postgres user password for the `portal` database user in Docker Compose. Required before deploying; use a long random password with no spaces. |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | Auth0 API identifier |
| `AUTH0_M2M_CLIENT_ID` | Auth0 M2M app client ID |
| `AUTH0_M2M_CLIENT_SECRET` | Auth0 M2M app client secret |
| `AUTH0_FELLOWS_ROLE_ID` | Auth0 role ID for the "fellows" role |
| `CIVICRM_BASE_URL` | CiviCRM instance URL |
| `CIVICRM_API_KEY` | CiviCRM API key |
| `CORS_ORIGIN` | Required in production (e.g., `https://dev-profile.itatti.net`) |
| `CLAIM_VIT_ID_URL` | Destination of the "Claim your VIT ID" button in the invitation email (e.g., `https://community.itatti.harvard.edu/claim-vit-id`) |
| `PORTAL_PUBLIC_URL` | Origin used to serve the I Tatti logo asset referenced from outgoing HTML emails |

### Optional services (features disabled if not set)

| Variable | Purpose |
|----------|---------|
| `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN` + `JIRA_SERVICE_DESK_ID` + `JIRA_REQUEST_TYPE_ID` | Jira SM help tickets |
| `ATLASSIAN_SCIM_BASE_URL` + `ATLASSIAN_SCIM_DIRECTORY_ID` + `ATLASSIAN_SCIM_BEARER_TOKEN` | Atlassian SCIM user/group sync |
| `SSE_SECRET` | HMAC key for SSE tokens (random fallback if not set, but tokens won't survive restarts) |
| `AWS_SES_REGION` + `AWS_SES_FROM_EMAIL` + AWS credentials | Appointee bio/project email sending via SES |

### Appointee email workflow (dev server vs. production)

The appointee email system covers both the **bio & project description** email (24h automated send after claim, dispatched by a daily cron) and the **VIT ID invitation** email (manual-only send from the Manage Appointees dashboard). Defaults are safe (nothing fires), so real production typically only sets the cron flag.

| Variable | Dev server (`civicrm-dev`) | Real production |
|----------|----------------------------|-----------------|
| `APPOINTEE_EMAIL_CRON_ENABLED` | `false` (do not auto-send bio emails) | `true` |
| `APPOINTEE_EMAIL_REDIRECT_TO` | developer inbox (e.g. `andrea@…`) | **unset** |
| `APPOINTEE_EMAIL_ALLOW_REDIRECT` | `true` (required when redirect is set under `NODE_ENV=production`) | **unset** / `false` |
| `APPOINTEE_EMAIL_BCC` | optional, suppressed automatically when redirect is active | optional |
| `APPOINTEE_EMAIL_FROM_NAME_VIT_ID` | `I Tatti - VIT ID` (default) | `I Tatti - VIT ID` (default) |
| `APPOINTEE_EMAIL_FROM_NAME_BIO` | `I Tatti - Bio & Project` (default) | `I Tatti - Bio & Project` (default) |
| `FORM_NOTIFICATION_EMAIL` | VIT ID staff inbox (e.g. `angela@…`) | VIT ID staff inbox |
| `FORM_NOTIFICATION_OVERRIDE_TO` | developer inbox (e.g. `andrea@…`) | **unset** |
| `FORM_INVITATION_TTL_DAYS` | `180` (or a shorter test window) | `180` unless policy requires less |

The server refuses to start if `APPOINTEE_EMAIL_REDIRECT_TO` is set under `NODE_ENV=production` without `APPOINTEE_EMAIL_ALLOW_REDIRECT=true`. This is an intentional guard against accidentally leaving the redirect on in real production.

`FORM_NOTIFICATION_EMAIL` is the production recipient for form-submission notifications (sent to VIT ID staff when an appointee submits a form). This is separate from `ADMIN_NOTIFICATION_EMAIL` which goes to IT.

`FORM_NOTIFICATION_OVERRIDE_TO` redirects form notifications to a specific address for dev/staging testing. When set, the email bypasses the dev-mode skip and always sends, regardless of `FORM_NOTIFICATION_EMAIL`.

The cron dispatches **only** bio-email rows; VIT ID invitations are manual-send-only. `CLAIM_VIT_ID_URL` and `PORTAL_PUBLIC_URL` are required for the invitation email's CTA and logo asset respectively — the server refuses to start without them.

### Browser runtime config

These are exposed publicly by `GET /api/config`. They are not secrets. Use `PUBLIC_*` values in deployed containers so the same GHCR image can run in dev and production without rebuilding.

| Variable | Purpose |
|----------|---------|
| `PUBLIC_AUTH0_DOMAIN` | Auth0 domain for the SPA |
| `PUBLIC_AUTH0_CLIENT_ID` | Auth0 SPA application client ID |
| `PUBLIC_AUTH0_AUDIENCE` | Auth0 API audience |
| `PUBLIC_AUTH0_CALLBACK_URL` | OAuth callback URL |
| `PUBLIC_AUTH0_NAMESPACE` | Auth0 custom claim namespace |
| `PUBLIC_API_BASE_URL` | Backend API base URL; usually blank for same-origin production |
| `PUBLIC_CIVICRM_URL` | CiviCRM URL for admin links |
| `PUBLIC_DEV_SKIP_AUTH` | Enables mock auth for local/dev-only cases |

Both server-side and browser-side development-auth switches are rejected when
`NODE_ENV=production`. Production-like dev/staging hosts must use real Auth0.

The old `VITE_*` values remain as local Vite fallback values only. They are no longer Docker build arguments and should not be used as the deployed configuration source.

## Database

PostgreSQL 17 runs in a separate container defined in `docker-compose.yml`. Data is persisted in a Docker named volume.

### Migrations

Migrations are in `packages/server/prisma/migrations/`. They run automatically on container start via `docker-entrypoint.sh`. To run manually:

```bash
docker compose exec portal node packages/server/node_modules/prisma/build/index.js migrate deploy
```

**Minimum PostgreSQL version: 12** — `20260423120000_add_vit_id_invitation_email_type` uses `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, a syntax added in PG12. Production runs PG17 (docker-compose), so the floor only matters for operators standing up new dev/staging boxes from older images.

### Appointee-email-events rekey migration (`20260423120001`)

This migration changes the unique key on `appointee_email_events` from
`(contact_id, academic_year, email_type)` to `(fellowship_id, email_type)`. It
assumes the table is empty at deploy time (the bio-email cron is gated on
`APPOINTEE_EMAIL_CRON_ENABLED=true` which production only flips after the
migration lands). A `DO $$ RAISE EXCEPTION` guard in the migration aborts if
any row is present at deploy time — belt-and-suspenders for the "someone
enabled the cron ahead of schedule" scenario.

**If the guard aborts:** never modify an already-applied migration file.
Prisma records a SHA-256 checksum of every migration in the `_prisma_migrations`
table; if a later `prisma migrate deploy` sees a mismatch, it refuses to run.
Editing `20260423120001_rekey_appointee_email_events_by_fellowship/migration.sql`
in place (even to remove the TRUNCATE block or tweak the `ADD COLUMN` to be
NULLABLE) would break every other environment that already applied the original
version. The only safe move is to add NEW migrations that layer on top.

The recovery is a three-migration sequence, run in this order:

1. `20260423120002_backfill_fellowship_id_nullable` — makes `fellowship_id`
   NULLABLE on the column the rekey migration tried to add. Because the rekey
   migration aborted BEFORE the `ADD COLUMN` ran, the column doesn't exist
   yet in the expected Prisma path — add it here as NULLABLE so we can write
   into it. The `IF NOT EXISTS` guard makes the recovery safe if an operator or
   prior recovery attempt already created the column outside that path.

   ```sql
   ALTER TABLE "appointee_email_events"
     ADD COLUMN IF NOT EXISTS "fellowship_id" INTEGER NULL;
   ```

2. `20260423120003_backfill_fellowship_id_populate` — runs a CiviCRM lookup
   for each existing row (same `(contactId, academicYear) → fellowshipId`
   resolution the app now does at send time) and writes the result via
   `UPDATE`. If you can't express the lookup in pure SQL (CiviCRM is remote),
   do this step as a one-off script that reads the rows, resolves, and
   issues UPDATEs — then record it as an empty Prisma migration after the
   fact (via `prisma migrate resolve --applied`) so the checksum chain stays
   intact.

3. `20260423120004_rekey_appointee_email_events_finalize` — once every row
   has `fellowship_id` populated, add the NOT NULL constraint and the new
   unique index. This is the migration that "completes" what the original
   rekey would have done, minus the TRUNCATE (which is now unnecessary
   because the backfill populated the values).

   ```sql
   ALTER TABLE "appointee_email_events"
     ALTER COLUMN "fellowship_id" SET NOT NULL;
   DROP INDEX IF EXISTS "appointee_email_events_contact_id_academic_year_email_type_key";
   DROP INDEX IF EXISTS "appointee_email_events_contact_id_idx";
   CREATE UNIQUE INDEX "appointee_email_events_fellowship_id_email_type_key"
     ON "appointee_email_events" ("fellowship_id", "email_type");
   CREATE INDEX "appointee_email_events_contact_id_academic_year_idx"
     ON "appointee_email_events" ("contact_id", "academic_year");
   ```

You'll also need to mark the aborted `20260423120001` migration as resolved —
since it failed partway, `_prisma_migrations` has a row with a NULL
`finished_at` that blocks future deploys:

```bash
docker compose exec portal npx prisma migrate resolve --rolled-back 20260423120001_rekey_appointee_email_events_by_fellowship
```

Then `prisma migrate deploy` will pick up the three new migrations in order.

**Rollback note:** this migration is **not reversible by image rollback**.
After it succeeds the schema has `fellowship_id NOT NULL` and a unique key
on `(fellowship_id, email_type)`. Rolling back the app image to a version
that doesn't know about `fellowship_id` means old code will fail NOT NULL
violations on any new insert. The supported recovery path after a bad
deploy is **fix-forward on the app code**, not image rollback. If rollback
is genuinely required, restore the database from a pre-migration backup
(see Backup/Restore above) alongside the app image downgrade.

### Backup

```bash
docker compose exec db pg_dump -U portal profile_portal > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
docker compose exec -T db psql -U portal profile_portal < backup_file.sql
```

### Restore drill

At least quarterly, restore the latest production-format backup into an isolated
PostgreSQL instance, run `prisma migrate deploy`, start the exact production
image, and verify `/api/health/ready`. Record the backup timestamp, image digest,
restore duration, and tester. Never test a restore against the live production
database or reuse production credentials in the isolated environment.

## Atlassian SCIM Sync

The sync feature requires a SCIM directory in Atlassian Guard:

1. Go to `admin.atlassian.com` → Security → Identity Providers
2. Find or create a SCIM directory under Auth0
3. Copy the Directory ID (UUID in the URL) and API key (bearer token)
4. Add to `.env`:
   ```
   ATLASSIAN_SCIM_BASE_URL=https://api.atlassian.com/scim/directory
   ATLASSIAN_SCIM_DIRECTORY_ID=<uuid>
   ATLASSIAN_SCIM_BEARER_TOKEN=<api-key>
   ```
5. Generate an SSE secret: `python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`
6. Add `SSE_SECRET=<output>` to `.env`

The sync is operated from the admin UI at `/admin/sync`.

## Troubleshooting

### Container won't start

Check logs: `docker compose logs portal`

Common causes:
- Missing required env vars (Zod validation fails at startup with a clear error listing missing vars)
- Database not reachable (check `DATABASE_URL` and that the db container is healthy)
- Migration failure (check if the migration SQL is valid)

### SCIM sync returns errors

- Verify the bearer token hasn't expired in Atlassian admin
- Check the API URL: should be `https://api.atlassian.com/scim/directory/{directoryId}/Users` (no `/scim/v2/` prefix)
- Check rate limits: the sync uses exponential backoff on 429 responses

### SSE progress not updating

- If behind cloudflared: ensure the `X-Accel-Buffering: no` header is being sent (already set in code)
- Check browser console for 401 errors on the `/stream` endpoint (SSE token may have expired, 5-min TTL)
