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

**Never add a `ports:` mapping to the portal service.** Rate limiting keys on the
`CF-Connecting-IP` header written by the Cloudflare edge, which is only
authoritative while *every* request arrives through the tunnel. A published host
port would let a caller reach the app directly and forge that header, making the
claim, help, and public-form rate limits bypassable.

### Container runtime settings

Both `docker-compose.yml` (local build) and `deploy/docker-compose.yml` (deployed
image) set the same runtime guarantees. Keep them in sync — the local file exists
so a locally built container fails the same way the deployed one would.

| Setting | Value | Why |
|---------|-------|-----|
| `init: true` | portal | Runs a real init as PID 1 so `SIGTERM` reaches node, the graceful-shutdown handler fires, and worker processes spawned by `sharp` / `@react-pdf/renderer` are reaped instead of becoming zombies. |
| `stop_grace_period` | 30s (portal), 60s (db) | Time to drain in-flight requests, pg-boss workers, and the Prisma pool before Docker escalates to `SIGKILL`. Must stay above the server's own 25s shutdown backstop (`SHUTDOWN_TIMEOUT_MS`) so a wedged drain force-exits itself *and logs why* instead of dying silently. PostgreSQL gets longer so restarts don't begin with crash recovery. |
| `healthcheck` | `/api/health/ready`, `interval: 15s`, `start_period: 180s` | Deep readiness (database + writable uploads + job queue). `start_period` exists because `docker-entrypoint.sh` runs `prisma migrate deploy` *before* the server listens — see "Deploy failures and migrations" below. |
| `deploy.resources.limits` | portal 1.5 CPU / 1536M, db 1 CPU / 1024M | A `sharp` or PDF-rendering spike must not take the VM down; the dev host also runs CiviCRM. If the portal starts getting OOM-killed under real load, raise the limit *and* the reservation together rather than removing the cap. |
| `pull_policy: missing` | db | `postgres:17-alpine` is a mutable tag. Without this an app deploy could fetch a new PostgreSQL minor version and recreate the database container as a side effect. See "Upgrading PostgreSQL". |

A memory limit turns a runaway process into a container restart rather than a
dead VM, which means **OOM kills show up as a crash loop, not as an outage of the
host**. Watch for that specifically (see "Monitoring").

Two caveats on the limits:

- `deploy.resources.limits` is applied by Compose **v2** (`docker compose`). The
  legacy `docker-compose` v1 binary ignores it unless invoked with
  `--compatibility`; all our tooling uses v2. Verify with
  `docker inspect --format '{{.HostConfig.Memory}}' $(docker compose ps -q portal)`
  — a `0` means no limit was applied.
- Node sizes its default V8 heap from the container's memory limit, so lowering
  the portal limit also lowers the heap. Native allocations made by `sharp` sit
  *outside* that heap, which is why the limit is set well above the heap the app
  needs.

### Single-instance constraint (do not scale the portal service)

**The portal runs exactly one container. `docker compose up --scale portal=2` is
not supported and will cause incorrect behaviour, not just extra load.** Several
subsystems keep state in the process rather than in PostgreSQL or Redis:

| Subsystem | Where the state lives | What a second container breaks |
|-----------|----------------------|--------------------------------|
| Rate limiters on the claim, help, and public-form routes | in-memory `express-rate-limit` stores | Each container counts separately, so the effective limit is multiplied by the number of containers — brute-force and enumeration protection degrade silently. |
| Fellows / CiviCRM lookup caches | in-process maps | Containers serve divergent data and a cache invalidation only reaches the container that handled the write. |
| SCIM sync progress SSE emitter map | in-process `EventEmitter` registry | A browser that reconnects to the other container receives no progress events, and the sync UI hangs at its last known percentage. |
| `node-cron` schedules (July 1 / July 2 automations, daily 09:00 bio-email dispatch) | one timer per process | Every schedule **double-fires**. The bio-email dispatcher's `PENDING → SENDING` guard is atomic so it won't double-send, but the July automations act on Auth0/JSM/CiviCRM and are not idempotent. |
| `prisma migrate deploy` in `docker-entrypoint.sh` | runs per container at startup | Two containers starting together race on the same migration. |
| SSE token signing key | random per process when `SSE_SECRET` is unset | Tokens issued by one container are rejected by the other. Always set `SSE_SECRET` (required in production). |

Making the portal horizontally scalable would require a shared rate-limit store,
a shared cache/pubsub, moving cron to a single leader or an external scheduler,
and separating migrations from container startup. None of that exists today.
Vertical scaling (raising the `deploy.resources.limits` values) is the supported
way to give the portal more capacity. This is also why the deploy is a
single-container replace with an automatic image rollback rather than a
rolling update.

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
| `CI` | GitHub-hosted | pull requests and pushes to `main` | Version consistency, zero-warning lint, typecheck, tests, and a production build. |
| `Build image` | GitHub-hosted | pushes to `main`, version tags, manual | Wait for CI to succeed for the same commit, then build and push GHCR images. |
| `Deploy dev` | Internal self-hosted runner | successful `Build image` from `main`, or manual image tag | Deploy dev automatically from accepted `main` code. |
| `Deploy production` | Internal self-hosted runner | manual `workflow_dispatch` version tag | Create a DB backup, then deploy the selected release tag. |

Production deploys are intentionally manual and tag-based. Dev deploys are automatic from `main`.

`CI` and `Build image` both trigger on a push to `main` and run in parallel, so
`Build image` explicitly waits (up to 30 minutes) for the `CI` run on the same
commit to conclude successfully before it publishes an image. Because `Deploy
dev` is triggered by a successful `Build image`, that single gate also stops a
direct push or an admin merge with red CI from auto-deploying to the dev VM —
which matters because that VM also hosts CiviCRM. The manual
`workflow_dispatch` path on `Deploy dev` takes an explicit image tag and is an
intentional break-glass escape hatch.

Every workflow that ships a version also runs `scripts/check-version-consistency.sh`,
which asserts that the `VERSION` file, the root `package.json` `version`, and the
newest `CHANGELOG.md` heading all state the same three-level version. The root
`package.json` version is what `packages/server/tsup.config.ts` bakes into
`__APP_VERSION__` and therefore what `/api/health/ready` reports, so drift there
would make step 4 of the release gate below report a version that was never
released.

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
4. Confirm `/api/health/ready` returns HTTP 200 in dev after the image is deployed,
   and that the `version` it reports equals the tag being released.
5. Run the public-form, staff administration, and fellow profile smoke tests.
6. Record the previous image tag and the backup filename in the release notes.
7. Confirm the scheduled backup timer ran within the last 24 hours (see
   "Scheduled backups") — the pre-deploy dump is not a substitute for it.

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

### Deploy failures and migrations

The deployment script automatically rolls the **portal application image** back
when the new container fails its internal readiness check or the configured
externally reachable health endpoint cannot be reached. The external health
endpoint is checked from the deploy runner, not from the VM: requests the VM
sends to its own public hostname hairpin through the Cloudflare edge, where
the WAF answers them with a managed challenge (403). It does not reverse
database migrations. If a migration is incompatible with the previous
application, use the migration-specific fix-forward path or restore the
pre-deploy database backup together with the previous image.

**`docker-entrypoint.sh` runs `prisma migrate deploy` before the server starts
listening.** A readiness failure therefore does *not* imply the database is
untouched — the new schema is very often already committed, and rolling the
image back leaves you running old code against a new schema. The readiness
budget is sized so a slow migration is not mistaken for a broken release:

- the container healthcheck has `start_period: 180s`, during which failing
  checks leave the container in `starting` instead of flipping it to `unhealthy`;
- `scripts/deploy-image.sh` waits `READY_WAIT_ATTEMPTS × READY_WAIT_INTERVAL`
  (default `150 × 4s` = 10 minutes) for `healthy`. Override those two
  environment variables on the workflow if a specific release ships a migration
  that is known to take longer.

Any failure path prints an explicit warning that a migration may already have
been applied, together with the `prisma migrate status` command and a pointer to
the recovery procedure. Do not treat an automatic rollback as a clean revert
until you have checked migration status.

## Environment Variables

All configuration is in `.env` at the project root. `.env.example` is the source
of truth for the full list with comments; the tables below are the operator view
of the same variables and are kept in sync with it.

### Required for the app to start

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` on both the dev VM and real production. Defaults to `development`, which relaxes several fail-closed guards — always set it explicitly in a deployed container. |
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
| `CLAIM_VIT_ID_URL` | Destination of the "Claim your VIT ID" button in the invitation email (e.g., `https://community.itatti.harvard.edu/claim-vit-id`). Must be `https://` in production. |
| `PORTAL_PUBLIC_URL` | Origin used to serve the I Tatti logo asset referenced from outgoing HTML emails. Must be `https://` in production. |
| `SSE_SECRET` | HMAC key for SSE tokens. Required in production and must decode to at least 32 bytes of base64 — the server refuses to start otherwise. Without it every container would generate a random key, so SCIM-sync progress tokens stop validating after any restart. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |

### Feature flags (default to off — nothing fires unless you set them)

Both flags below default to `false`. That is deliberate so a dev/staging box
running with `NODE_ENV=production` cannot fire real jobs, but it also means a
freshly provisioned **real** production instance ships with these features inert
until an operator turns them on.

| Variable | Default | Effect when unset/false |
|----------|---------|-------------------------|
| `AUTOMATIONS_ENABLED` | `false` | The July 1 end-of-year cleanup and July 2 new-cohort onboarding cron jobs are **never registered**. Manual dry-run/execute from the admin UI still works, so this flag only controls the scheduled runs. Set to `true` on the real production instance only — on the dev VM it would fire against real Auth0/JSM/CiviCRM. |
| `APPOINTEE_EMAIL_CRON_ENABLED` | `false` | ⚠️ **The entire bio-email pipeline is inert.** See the callout below. |

> **⚠️ `APPOINTEE_EMAIL_CRON_ENABLED` must be `true` on real production.**
> The bio & project description email is queued automatically 24 hours after an
> appointee claims their VIT ID, and the daily 09:00 Europe/Rome cron is what
> dispatches queued rows in bulk — that cron is not registered at all when this
> flag is unset or `false`, so without it no appointee is emailed automatically.
> The manual **Send bio email** action in Manage Appointees now dispatches an
> existing `PENDING` row on the spot (the atomic `PENDING → SENDING` claim means
> it cannot collide with a concurrent cron run), so an operator *can* clear the
> queue by hand if the flag was left off — but that is a manual, per-appointee
> recovery, not a substitute for the flag. Set `APPOINTEE_EMAIL_CRON_ENABLED=true`
> on real production so the automatic daily dispatch runs; there is no alert for a
> silently-off flag today, so check it as part of provisioning and after any
> `.env` change (see "Monitoring"). See CHANGELOG 0.17.15 "Queued appointee emails
> can be sent by hand".

### Optional services (features disabled if not set)

| Variable | Purpose |
|----------|---------|
| `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN` + `JIRA_SERVICE_DESK_ID` + `JIRA_REQUEST_TYPE_ID` | Jira SM help tickets |
| `ATLASSIAN_SCIM_BASE_URL` + `ATLASSIAN_SCIM_DIRECTORY_ID` + `ATLASSIAN_SCIM_BEARER_TOKEN` | Atlassian SCIM user/group sync |
| `ATLASSIAN_JSM_SITE1_URL` + `ATLASSIAN_JSM_SITE1_FORMER_ORG_ID` + `ATLASSIAN_JSM_SITE1_CURRENT_ORG_ID` + the three matching `SITE2` values | JSM "Former/Current Appointees" organization membership on both I Tatti sites. **All six must be set**; if any is missing the feature is silently disabled, which also silently no-ops that part of the July automations. |
| `AWS_SES_REGION` + `AWS_SES_FROM_EMAIL` | Transactional email via SES (appointee emails, form notifications). With either missing the app logs emails instead of sending them. |
| `ADMIN_NOTIFICATION_EMAIL` | Recipient for IT-admin notifications and automation reports. With it missing only those admin emails are skipped — appointee emails and form notifications still send. |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Read directly from the environment by the AWS SDK. Leave unset if the host provides an IAM role. |
| `AUTH0_FELLOWS_CURRENT_ROLE_ID` | Auth0 role granted only to the current academic year's cohort. **Required for the July automations** to move fellows in and out of the current cohort; the automation cannot do its job without it. |
| `AUTH0_CONNECTION` | Auth0 database connection name. Defaults to `Username-Password-Authentication`. |
| `CIVICRM_SITE_KEY` | Only needed if the CiviCRM instance requires a site key alongside the API key. |
| `CIVICRM_FELLOWSHIP_ENTITY` + `CIVICRM_FIELD_START_DATE` + `CIVICRM_FIELD_END_DATE` + `CIVICRM_FIELD_ACCEPTED` + `CIVICRM_FIELD_APPOINTMENT` + `CIVICRM_FIELD_FELLOWSHIP` | CiviCRM custom-field mapping. Defaults match the I Tatti instance; override only if the CiviCRM schema differs. |
| `APPOINTEE_EMAIL_LOGO_URL` | Absolute logo URL for outgoing appointee emails. Set this when the portal domain is behind Cloudflare/Auth0 and inboxes cannot fetch `${PORTAL_PUBLIC_URL}/itatti-logo-email.png` anonymously — otherwise recipients see a broken image. Must be `https://` in production. |
| `PORT` | Server listen port. Defaults to `3000`, which is what the container healthcheck and the tunnel expect — do not change it in a deployed container. |
| `LOG_LEVEL` | pino level (`trace`…`fatal`, `silent`). Defaults to `info` under `NODE_ENV=production`, `debug` otherwise. Never set it more restrictive than `error` in production — `fatal`/`silent` drop the records that log-based alerting relies on. |
| `DEV_SKIP_EXTERNAL_SERVICES` | Local UI testing only — replaces auth and every external integration with privileged mocks. The server refuses to start with it enabled under `NODE_ENV=production`. |

### Appointee email workflow (dev server vs. production)

The appointee email system covers both the **bio & project description** email (24h automated send after claim, dispatched by a daily cron) and the **VIT ID invitation** email (manual-only send from the Manage Appointees dashboard). Defaults are safe (nothing fires), so real production typically only sets the cron flag.

| Variable | Dev server (`civicrm-dev`) | Real production |
|----------|----------------------------|-----------------|
| `APPOINTEE_EMAIL_CRON_ENABLED` | `false` (do not auto-send bio emails) | `true` |
| `APPOINTEE_EMAIL_REDIRECT_TO` | developer inbox (e.g. `andrea@…`) | **unset** |
| `APPOINTEE_EMAIL_ALLOW_REDIRECT` | `true` (required when redirect is set under `NODE_ENV=production`) | **unset** / `false` |
| `APPOINTEE_EMAIL_BCC` | optional, suppressed automatically when redirect is active | optional |
| `APPOINTEE_EMAIL_REPLY_TO` | optional | **recommended** — a monitored inbox, since `AWS_SES_FROM_EMAIL` is no-reply |
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
# -w matters: the Prisma 7 CLI resolves prisma.config.ts (schema path +
# datasource URL) from its working directory — run from /app it finds neither.
docker compose exec -w /app/packages/server portal node node_modules/prisma/build/index.js migrate deploy
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
# The runtime image ships without npx/npm — invoke the Prisma CLI directly,
# from packages/server so it finds prisma.config.ts.
docker compose exec -w /app/packages/server portal node node_modules/prisma/build/index.js migrate resolve --rolled-back 20260423120001_rekey_appointee_email_events_by_fellowship
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

Three separate things produce a dump. Know which one you are relying on:

| Source | When it runs | Retention | Offsite |
|--------|--------------|-----------|---------|
| `scripts/backup-database.sh` (cron / systemd timer on the VM) | daily, unattended | pruned by `BACKUP_RETENTION_DAYS`, floor of `BACKUP_MIN_KEEP` | yes, if `BACKUP_OFFSITE_COMMAND` is configured — **do configure it** |
| `scripts/deploy-image.sh` pre-deploy dump (`CREATE_BACKUP=true`, set by `Deploy production`) | only when production is deployed | none — grows forever | no |
| Manual `pg_dump` (below) | when you run it | none | no |

The pre-deploy dump is a per-release safety net, **not** a backup regime: it only
exists on days a release ships. The scheduled timer is what gives us a recovery
point objective.

#### Scheduled backups

`scripts/backup-database.sh` runs `pg_dump` inside the running `db` container, so
the dump is always produced by the same PostgreSQL major version that owns the
data. It writes to `<file>.partial` and renames only after `pg_dump` exits 0 *and*
the `-- PostgreSQL database dump complete` marker is present, so a truncated dump
can never be mistaken for a good recovery point. Any failure exits non-zero with a
`profile-portal backup FAILED:` line on stderr.

Install it on the VM (the repository is not checked out there, so copy the single
script in — it has no dependencies beyond `docker` and `gzip`):

```bash
sudo install -o root -g root -m 750 backup-database.sh /opt/profile-portal/scripts/backup-database.sh
sudo install -d -m 750 /opt/profile-portal/backups
```

**Option A — crontab** (`sudo crontab -e`). stdout goes to a log file so cron
only mails you when something is written to stderr, i.e. on failure:

```cron
BACKUP_VERBOSE=true
BACKUP_RETENTION_DAYS=14
BACKUP_MIN_KEEP=7
BACKUP_OFFSITE_COMMAND=rclone copyto "$1" itatti-backups:profile-portal/"$(basename "$1")"
MAILTO=it@itatti.harvard.edu
15 2 * * * /opt/profile-portal/scripts/backup-database.sh >> /var/log/profile-portal-backup.log
```

**Option B — systemd timer** (preferred: failures land in `systemctl status` and
the journal rather than depending on local mail delivery).

`/etc/systemd/system/profile-portal-backup.service`:

```ini
[Unit]
Description=Profile Portal PostgreSQL backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=DEPLOY_PATH=/opt/profile-portal
Environment=BACKUP_VERBOSE=true
Environment=BACKUP_RETENTION_DAYS=14
Environment=BACKUP_MIN_KEEP=7
# Offsite copy — see "Offsite copy is required" below.
Environment=BACKUP_OFFSITE_COMMAND=rclone copyto "$1" itatti-backups:profile-portal/"$(basename "$1")"
ExecStart=/opt/profile-portal/scripts/backup-database.sh
```

`/etc/systemd/system/profile-portal-backup.timer`:

```ini
[Unit]
Description=Daily Profile Portal PostgreSQL backup

[Timer]
OnCalendar=*-*-* 02:15:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now profile-portal-backup.timer
sudo systemctl start profile-portal-backup.service   # verify a real run
sudo systemctl list-timers profile-portal-backup.timer
```

#### Where dumps go and how long they are kept

- Location: `BACKUP_DIR`, default `$DEPLOY_PATH/backups` (`/opt/profile-portal/backups`).
- Filename: `profile_portal_<UTC-YYYYmmdd-HHMMSS>.sql.gz`. The pre-deploy dumps
  from `deploy-image.sh` use `profile_portal_<image-tag>_<stamp>.sql` and are
  pruned by the same retention rules.
- Retention: dumps older than `BACKUP_RETENTION_DAYS` (default 14) are deleted,
  **except** that the newest `BACKUP_MIN_KEEP` (default 7) are always kept
  regardless of age. That floor means a week of failed runs can never leave the
  directory empty.
- The script refuses to run concurrently (lock directory `backups/.backup.lock`).
  If a run is killed, remove that directory manually. Leftover `*.partial` files
  are reported on stderr on the next run.

#### Offsite copy is required

`BACKUP_DIR` lives on the **same VM disk as the `pgdata` volume**, so a disk
failure, a botched VM operation, or ransomware takes the database and every
backup together. Local dumps only protect against logical damage (a bad
migration, a wrong `DELETE`) — not against losing the host.

Set `BACKUP_OFFSITE_COMMAND` to a command that ships the finished dump somewhere
else. It runs via `bash -c`, receives the dump path as `"$1"`, and a non-zero
exit fails the whole backup run (so it alerts). Examples:

```sh
# rclone to any supported remote (Google Drive, S3, B2, SFTP…)
BACKUP_OFFSITE_COMMAND='rclone copyto "$1" itatti-backups:profile-portal/"$(basename "$1")"'

# AWS S3 with lifecycle-managed retention
BACKUP_OFFSITE_COMMAND='aws s3 cp "$1" s3://itatti-profile-portal-backups/'

# scp to another I Tatti host
BACKUP_OFFSITE_COMMAND='scp -i /root/.ssh/backup_key "$1" backups@backup-host:/srv/profile-portal/'
```

If it is unset the script still produces a local dump but writes a
`BACKUP_OFFSITE_COMMAND is not set` warning to stderr on every run — which cron
will mail you daily until it is configured. That noise is intentional.

#### Restore from a scheduled dump

Dumps are plain-text `pg_dump` output (no `--clean`), gzipped by default, so they
carry `CREATE`/`COPY` statements but no `DROP`. Loading one into the existing,
populated `profile_portal` therefore fails with "already exists" under
`ON_ERROR_STOP=1`. Always restore into a **fresh** database, then promote it —
this also means a bad dump never destroys your current data before you've
verified it.

```bash
cd /opt/profile-portal
docker compose stop portal   # no client left connected to profile_portal

# 1. Load the dump into a clean, throwaway database. The live profile_portal is
#    untouched at this stage.
docker compose exec -T db psql -U portal postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS profile_portal_restore;' \
  -c 'CREATE DATABASE profile_portal_restore OWNER portal;'

# gzipped (default)
gzip -cd backups/profile_portal_20260731-021500.sql.gz \
  | docker compose exec -T db psql -U portal -v ON_ERROR_STOP=1 profile_portal_restore

# uncompressed (e.g. a pre-deploy dump)
docker compose exec -T db psql -U portal -v ON_ERROR_STOP=1 profile_portal_restore \
  < backups/profile_portal_v0.17.15_20260731-021500.sql

# 2. Sanity-check the restored copy (row counts, most recent rows, etc.).
#    This is where the quarterly restore drill STOPS — validate, then drop
#    profile_portal_restore without promoting.

# 3. Promote: retire the current database and rename the restored one into its
#    place. Both renames run from the maintenance DB with the app stopped, so
#    nothing is connected to either.
docker compose exec -T db psql -U portal postgres -v ON_ERROR_STOP=1 \
  -c 'ALTER DATABASE profile_portal RENAME TO profile_portal_old;' \
  -c 'ALTER DATABASE profile_portal_restore RENAME TO profile_portal;'

docker compose start portal
docker compose logs -f portal   # confirm `prisma migrate deploy` reports no pending work
# Once the app is confirmed healthy, drop the retired copy:
#   docker compose exec -T db psql -U portal postgres -c 'DROP DATABASE profile_portal_old;'
```

If the restored dump predates the schema the current image expects, the app's
startup `prisma migrate deploy` brings it forward. If it is *newer* than the
image, deploy the matching image tag instead of downgrading the schema.

### Manual backup and restore

```bash
# Backup
docker compose exec db pg_dump -U portal profile_portal > backup_$(date +%Y%m%d).sql

# Restore — replaces the current database. Plain dumps carry no DROP statements,
# so drop and recreate the target first; otherwise the load fails on existing
# objects. Stop the app so nothing is connected to profile_portal.
docker compose stop portal
docker compose exec -T db psql -U portal postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS profile_portal;' \
  -c 'CREATE DATABASE profile_portal OWNER portal;'
docker compose exec -T db psql -U portal -v ON_ERROR_STOP=1 profile_portal < backup_file.sql
docker compose start portal
```

### Upgrading PostgreSQL

`postgres:17-alpine` is a mutable tag, so an unscoped `docker compose pull` would
fetch a new minor version and recreate the database container as a side effect of
shipping application code. Two guards prevent that: `scripts/deploy-image.sh`
runs `docker compose pull portal` (service-scoped), and the `db` service sets
`pull_policy: missing`.

To take a PostgreSQL update deliberately:

```bash
cd /opt/profile-portal
/opt/profile-portal/scripts/backup-database.sh          # fresh verified dump first
docker compose pull db                                   # explicit, operator-initiated
docker compose up -d db
docker compose logs --tail=50 db                         # confirm it started cleanly
```

A **minor** update (17.x → 17.y) reuses the existing `pgdata` volume. A **major**
update (17 → 18) does not: the data directory is version-specific and the new
container will refuse to start. A major upgrade needs a dump/restore into a fresh
volume, planned as its own maintenance window.

### Restore drill

At least quarterly, restore the latest production-format backup into an isolated
PostgreSQL instance, run `prisma migrate deploy`, start the exact production
image, and verify `/api/health/ready`. Record the backup timestamp, image digest,
restore duration, and tester. Never test a restore against the live production
database or reuse production credentials in the isolated environment.

Restore the newest **scheduled** dump (and, if an offsite copy is configured, the
copy pulled back *from offsite* rather than the local file) — restoring a
pre-deploy dump only proves the deploy path works, not the daily one.

## Monitoring

**There is no monitoring today.** No Sentry, no Prometheus, no uptime check, no
alerting. The Docker healthcheck marks a container `unhealthy` and `restart:
unless-stopped` restarts it on exit, but nothing notifies a human, and nothing
notices a container that is up and serving errors. This section describes the
minimum that should be in place for launch; none of it is provisioned yet.

### 1. External uptime check against `/api/health/ready`

`/api/health/ready` already verifies PostgreSQL, writable upload storage, and the
job queue, and returns the running version. Point an external checker at it
(anything that can do an HTTPS GET on a schedule — Better Stack / Uptime Robot /
Healthchecks.io / a Cloudflare Worker cron / an existing I Tatti monitoring host):

- URL: `https://<portal-host>/api/health/ready`
- Expect HTTP 200; treat any non-200 or timeout as down
- Interval 1–5 minutes, alert after 2 consecutive failures
- Alert to the IT inbox and, ideally, a phone-reachable channel

The check **must come from outside the VM.** Requests the VM sends to its own
public hostname hairpin through the Cloudflare edge, where the WAF answers with a
managed challenge (403) — this is the same trap that broke the deploy healthcheck
in 0.17.13. If the WAF also challenges the monitoring service, add a WAF skip rule
for the checker's user agent or source IPs scoped to the `/api/health/ready` path
only.

Do not point the uptime check at the shallow `/api/health`: it answers 200 with a
dead database.

### 2. Log-based alerting on ERROR

Logs are structured JSON from pino (`level: 50` = error, `60` = fatal) on the
container's stdout, captured by the `json-file` driver with `max-size: 50m` /
`max-file: 7`. Whatever ships or scans them, the minimum useful alert is
"any `level >= 50` record", deduplicated over a few minutes:

```bash
# ad-hoc triage on the VM
docker compose logs --since 24h portal | grep -c '"level":50'
docker compose logs --since 1h portal | grep '"level":5[05]' | tail -20
```

`LOG_LEVEL` must not be set more restrictive than `error` (default `info` in
production) or these records never reach the log at all. Note the retention
ceiling: 7 × 50 MB per container. A noisy incident can roll the window in well
under a day, so anything that needs post-hoc investigation has to be shipped off
the box, not read from the local log later.

### 3. What to watch specifically

| Signal | Why it matters | Where to look |
|--------|----------------|---------------|
| **Crash loops** | With a memory limit set, a `sharp`/PDF spike shows up as an OOM kill and restart, not as a host outage. `restart: unless-stopped` hides it from the uptime check if restarts are fast. | `docker inspect --format '{{.RestartCount}} {{.State.OOMKilled}}' $(docker compose ps -q portal)` — alert on a rising restart count or `OOMKilled=true`. |
| **Container `unhealthy`** | Readiness is failing but the process is alive, so no restart happens and the app keeps taking traffic. | `docker inspect --format '{{.State.Health.Status}}' $(docker compose ps -q portal)` |
| **SES send failures** | Appointee and form-notification emails fail per-message; SES throttling or a verification/sandbox problem is invisible unless the error log is watched. `FAILED` rows in `appointee_email_events` are the durable evidence. | error-level logs from the email service; `SELECT status, count(*) FROM appointee_email_events GROUP BY status;` |
| **Cron non-execution** | The worst failure here is silent. If `APPOINTEE_EMAIL_CRON_ENABLED` is unset the dispatcher is never even registered (see the callout in Environment Variables) and rows pile up in `PENDING`; the July automations likewise just never run. | On startup the server logs whether each schedule was registered — check that after every deploy. Then alert on `PENDING` rows older than ~48h: `SELECT count(*) FROM appointee_email_events WHERE status = 'PENDING' AND created_at < now() - interval '48 hours';` |
| **Backup freshness** | A backup regime nobody watches is not a backup regime. | Newest file in `/opt/profile-portal/backups` older than ~26h, or a failed `systemctl status profile-portal-backup.service`. A dead-man's-switch ping (e.g. Healthchecks.io) appended to `BACKUP_OFFSITE_COMMAND` alerts on *absence* of a run, which plain cron mail cannot. |
| **Disk space** | Dumps, 7×50 MB of logs per container, and the uploads volume share one disk with `pgdata`. A full disk stops PostgreSQL writing. | `df -h`, alert at 80%. |
| **Certificate / tunnel health** | The tunnel is the only ingress; if `cloudflared` drops, the app is fine and unreachable. | Covered by the external uptime check, which is exactly why it must be external. |

### 4. Explicitly out of scope for now

No APM, no distributed tracing, no error-grouping service, no metrics/dashboards.
Adding a Sentry (or equivalent) DSN for the server and the browser bundle is the
highest-value next step because it converts "an error was logged on a VM nobody
is tailing" into an alert with a stack trace — but it is a new dependency and a
new outbound egress path, so it is a deliberate decision, not part of this
hardening pass.

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

The sync is operated from the admin UI at `/admin/atlassian/sync`.

## Troubleshooting

### Container won't start

Check logs: `docker compose logs portal`

Common causes:
- Missing required env vars (Zod validation fails at startup with a clear error listing missing vars)
- Database not reachable (check `DATABASE_URL` and that the db container is healthy)
- Migration failure (check if the migration SQL is valid)
- OOM kill against the container memory limit — `docker inspect --format '{{.State.OOMKilled}} {{.RestartCount}}' $(docker compose ps -q portal)`

### Deploy failed and rolled the image back

Read "Deploy failures and migrations" above first. The rollback restores the
application image only; check `prisma migrate status` before assuming the database
is where the old image expects it.

If the failure was just a slow migration rather than a broken release, raise the
readiness budget for that deploy (`READY_WAIT_ATTEMPTS`, `READY_WAIT_INTERVAL`)
instead of retrying the same 10-minute window.

### Scheduled backup is failing

`scripts/backup-database.sh` prints one `profile-portal backup FAILED:` line
naming the cause. The usual ones:

- `Database service 'db' is not running` — the compose project is down, or
  `DEPLOY_PATH` points at the wrong directory.
- `Another backup run holds …/.backup.lock` — a previous run was killed; remove
  the lock directory after confirming no `pg_dump` is running.
- `Dump is missing the pg_dump completion marker` — the dump was truncated
  (usually a full disk). Check `df -h`; the `.partial` file is discarded, so no
  bad dump is left behind.
- `Offsite copy failed` — the local dump is intact and kept; fix the remote and
  re-run the script by hand.

### SCIM sync returns errors

- Verify the bearer token hasn't expired in Atlassian admin
- Check the API URL: should be `https://api.atlassian.com/scim/directory/{directoryId}/Users` (no `/scim/v2/` prefix)
- Check rate limits: the sync uses exponential backoff on 429 responses

### SSE progress not updating

- If behind cloudflared: ensure the `X-Accel-Buffering: no` header is being sent (already set in code)
- Check browser console for 401 errors on the `/stream` endpoint (SSE token may have expired, 5-min TTL)
