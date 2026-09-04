# I Tatti Profile Portal

A single portal application for I Tatti staff and appointees (fellows). Users log in via Auth0, view their profile, access role-filtered internal applications, and (for appointees) claim their VIT ID credentials.

## Quick Start

```bash
# Install dependencies
pnpm install

# Generate the Prisma client — required before typecheck/build/test will pass
pnpm db:generate

# Copy environment variables
cp .env.example .env
# Fill in Auth0, CiviCRM, and Jira credentials in .env

# Run database migrations
pnpm db:migrate

# Start development (server + frontend)
pnpm dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- The Vite dev server proxies `/api/*` to the backend

**`pnpm db:generate` is not optional on a fresh clone.** The Prisma client is
generated into `node_modules`, not committed, and `packages/server` imports its
generated types directly — so `pnpm typecheck` reports roughly 40 errors in
`packages/server` until it has been run once. Run it again after any change to
`packages/server/prisma/schema.prisma`. CI does this explicitly before linting
and typechecking.

## Project Structure

```
packages/
  shared/    # @itatti/shared — TypeScript types & constants
  server/    # @itatti/server — Express backend (Node.js)
  web/       # @itatti/web — React + Vite frontend
auth0/       # Auth0 configuration reference files
```

## Key Features

- **Auth0 Login** — Supports VIT ID (email/password) and Microsoft Entra ID (staff)
- **Role-Based Sections** — Sidebar and content driven by Auth0 roles (`fellows`, `fellows-current`, `fellows-admin`, `staff-IT`)
- **My Profile** — Read-only CiviCRM profile data (falls back to Auth0 profile for staff)
- **Applications Catalog** — Internal apps filtered by user roles
- **Admin Section** — `staff-IT` users manage the applications catalog and assign role visibility
- **Claim VIT ID** — Self-service flow: email → CiviCRM eligibility check → 4-tier VIT ID match ladder (primary email, Auth0 `civicrm_id`, CiviCRM secondary emails, normalized name) → Auth0 account creation or password reset to the existing account. Returning fellows whose email changed between fellowships are routed to their existing account instead of spawning a duplicate.
- **VIT ID lookup** — `/admin/has-vitid` page (for `fellows-admin` or `staff-IT`) with unified server-side search (`POST /api/admin/vit-id-lookup` with body `{ q }` — POST so email addresses never land in access logs or proxies). Handles email-style queries (full reverse ladder) and name-style queries (substring match) so staff can find a fellow's VIT ID even when it's stored under an older email.
- **Manage Appointees** — Staff dashboard with a seven-state lifecycle column (*Nominated* → *Nomination Sent* → *Form Submitted* → *Accepted* → *VIT ID Sent* → *VIT ID Claimed* → *Enrolled*) derived from `(fellowshipAccepted, VIT ID match tier, invitation event, bio email event, form invitation events)`. A dedicated Form column uses the labels **Ready** (configured but no link yet), **Not configured**, **Link Generated**, **Waiting**, **Submitted**, and **Expired**. Row actions include **Generate Form Link** (only for appointment/fellowship combinations with configured forms), **Nomination sent** (records the external email date), **Send VIT ID email** (invites a new appointee to claim), and **Send bio email** (requests bio + project description from a claimed appointee); the email actions route through a shared email preview modal so Angela sees the full rendered HTML before hitting Send.
- **HTML appointee emails** — Both appointee-facing emails (VIT ID invitation + bio & project description) ship as brand-styled HTML via an MJML 5 template pipeline. I Tatti logo header, Georgia serif body, squared crimson CTA, multipart/alternative plaintext fallback for spam scoring. Compiled HTML is checked in; production never loads MJML at runtime.
- **Appointee forms** — Public fellowship forms are token-based, sectioned, and backed by shared form definitions. New Full year Fellow invitations use the active `fellow-memorandum-v3` template, while short-term Fellow appointment rows can route to standard term, Dumbarton Oaks, or Graduate Fellow templates based on the raw CiviCRM `Fellowship` value. Retired definitions stay available so old submissions and PDFs keep rendering correctly.
- **Form Submissions archive** — Staff page at `/admin/forms` listing every submitted appointee form with master-detail layout, facet-driven filters (academic year, form, search), and separate Memorandum / grant-section PDF downloads that route through bearer auth and match the submission notification email attachments. Grant PDF labels follow the submitted form version, so retired submissions keep Grants & Resources while the active Fellow memorandum uses Grant Information. Form templates live at `/admin/forms/templates` with Active and Retired tabs (newest version first, registry id shown per card) and surface each form's section descriptions and field help text so staff can read appointee guidance without opening a live form. Deep-linkable via `?invitation=<id>`.
- **Help Form** — Creates a Jira Service Management ticket for manual assistance

## Auth0 Setup

The full checklist of dashboard-held tenant configuration (and how to keep it
reproducible with `a0deploy export`) lives in [`auth0/README.md`](auth0/README.md).

### Required Auth0 Configuration

1. **SPA Application** — For the React frontend (`@auth0/auth0-react`)
2. **M2M Application** — For the backend to call the Management API
3. **API Identifier** — Audience for JWT verification
4. **Enterprise Connection** — Microsoft Entra ID for `@itatti.harvard.edu` staff
5. **Post-Login Action** — Deploy `auth0/post-login-action.js` to enrich tokens with roles and `civicrm_id`
6. **Page Template** — Deploy `auth0/page-template.html` to add "Claim your VIT ID" link on the login page

### Auth0 Roles

| Role | Business Meaning |
|------|-----------------|
| `fellows` | All appointees (former + current) |
| `fellows-current` | Current academic year appointees |
| `fellows-admin` | Staff managing appointees (Manage Appointees, emails, forms, VIT ID lookup) |
| `staff-IT` | IT staff with full admin access |

Role strings are matched exactly (see `packages/shared/src/constants/roles.ts`) — the casing of `staff-IT` matters.

## Environment Variables

See `.env.example` for the full list. Key groups:

- **Auth0** — Domain, audience, M2M client credentials, connection name, fellows role ID
- **CiviCRM** — Base URL, API key, site key, fellowship field mapping
- **Jira SM** — Base URL, auth credentials, service desk/request type IDs
- **Database** — PostgreSQL connection URL
- **CORS** — Required in production (`CORS_ORIGIN`)

## CiviCRM Field Mapping

Fellowship field names are configurable via environment variables:

```env
CIVICRM_FELLOWSHIP_ENTITY=Custom_Fellowships
CIVICRM_FIELD_START_DATE=Fellowship_Start_Date
CIVICRM_FIELD_END_DATE=Fellowship_End_Date
CIVICRM_FIELD_ACCEPTED=Fellowship_Accepted
```

Update these to match your CiviCRM instance. Use the CiviCRM API Explorer (`/civicrm/api4`) to discover the exact entity and field names.

## Production Build

```bash
pnpm build
cd packages/server && node dist/index.js
```

The server serves both the API and the built frontend static files.

## Docker Deployment

```bash
# Build and start (requires .env file with production values)
docker compose up -d --build

# View logs
docker compose logs -f portal

# Stop
docker compose down
```

For local development, use the dev compose file (Postgres only):
```bash
docker compose -f docker-compose.dev.yml up -d
```

The Docker setup includes:
- Multi-stage build (Node 22 Alpine)
- PostgreSQL 17 with health checks
- Automatic Prisma migrations on startup
- Structured JSON logging via pino
- A deep container healthcheck against `/api/health/ready` (database + upload
  storage + job queue), with a `start_period` that allows for a slow migration —
  the shallow `/api/health` would report a healthy container with a dead database
- `init: true` plus a 30s `stop_grace_period` so `SIGTERM` reaches node and the
  server can drain
- Conservative CPU/memory limits on both services

The portal is designed to run as a **single** container — `--scale portal=2` would
double-fire cron jobs, multiply the in-memory rate limits, and race migrations.
See the "Single-instance constraint" section of [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Assumptions

1. CiviCRM API v4 REST is enabled with the `authx` extension
2. Auth0 database connection is named `Username-Password-Authentication`
3. Jira SM uses REST API with Basic auth (email + API token)
4. Application logos are stored as URLs (not file uploads)
5. Auth0 custom claim namespace: `https://auth0.itatti.harvard.edu`

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Stack choices, claim flow, VIT ID match ladder, appointee email pipeline, security model.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Dev server setup, env var reference, migrations, troubleshooting.
- [`CHANGELOG.md`](./CHANGELOG.md) — Every shipped version with a user-facing summary.
- [`TODOS.md`](./TODOS.md) — Deferred work and known follow-ups.
