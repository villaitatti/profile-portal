# Architecture

## Overview

The I Tatti Profile Portal is a full-stack web application built as a **pnpm monorepo** with three packages:

- **`@itatti/shared`** — Shared TypeScript types and constants
- **`@itatti/server`** — Express backend (Node.js)
- **`@itatti/web`** — React + Vite frontend

## Backend: Express on Node.js

The backend uses Express with:
- `express-jwt` + `jwks-rsa` for Auth0 JWT verification (RS256)
- Server-side RBAC middleware (`requireRole`) on protected routes
- Zod for environment variable validation at startup

### Module layout (`src/lib/` vs `src/services/` vs `src/routes/`)

- **`lib/`** — infrastructure with no domain knowledge: logging, Prisma client,
  HTTP error type, hashing, token signing, client-IP resolution, upstream API
  clients. `lib/` modules must never import from `services/` (the dependency
  points one way; the old `lib/fellows-cache.ts` inversion was fixed by moving
  it into `services/`).
- **`services/`** — domain logic: policy, orchestration, transactions, and any
  query construction reused by more than one caller. May import `lib/`.
- **`routes/`** — HTTP concerns: validation schemas, status codes, response
  shaping. Simple resource-local CRUD may query Prisma directly in the route;
  anything reusable or policy-bearing belongs in a service. Dev-mode fixtures
  live in `routes/__dev__/fixtures.ts`, not in the route modules.

Async handler convention: rely on Express 5's native forwarding of rejected
promises to the error middleware. Write a try/catch in a handler only to map an
error (e.g. Prisma P2025 → 404) or to add contextual logging before rethrowing.

### Deliberately single-instance

The server is designed to run as **exactly one process**. Rate-limit stores, the
CiviCRM/fellows lookup caches, and the SCIM-sync SSE emitter registry are all
in-memory; `node-cron` schedules (July 1 / July 2 automations, the daily bio-email
dispatch) are per-process timers; and `prisma migrate deploy` runs at container
startup. A second replica would multiply the effective rate limits, serve
divergent cached data, strand SSE subscribers on the wrong process, double-fire
the non-idempotent July automations, and race the migration.

This is a conscious trade for a portal serving a few hundred fellows and a handful
of staff: no Redis, no external scheduler, no leader election. Capacity is added
vertically. Anything that would require a second instance (or that assumes one
exists) needs the shared-state work described in the "Single-instance constraint"
section of `DEPLOYMENT.md` first.

## Database: PostgreSQL + Prisma ORM

- PostgreSQL for relational data (applications catalog, fellow invite tracking)
- Prisma ORM provides type-safe queries and versioned migrations
- PrismaClient singleton with global caching for dev hot-reload

## Frontend: React + Vite + shadcn/ui + Tailwind CSS v4

**Why shadcn/ui** (not MUI, Chakra, Mantine):
- Components are copied into the project — full ownership and customizability
- Built on Base UI primitives (`@base-ui/react`, shadcn style `base-nova`) with a clean, neutral aesthetic — the same house stack as Libra
- Ships a composable Sidebar component with collapse support (`src/components/ui/sidebar.tsx`, wired in `AppSidebar`)
- Easy to customize CSS variables for institutional branding

**Theming:** light and dark mode. Semantic color primitives live on `:root`/`.dark` in `src/styles/globals.css` and are bridged to Tailwind utilities via `@theme inline`. The `.dark` class on `<html>` is managed by `ThemeProvider` (`src/lib/theme.tsx`, persisted in localStorage under `profile-portal:theme`) and applied before first paint by `public/theme-init.js` — an external script because the production CSP is `script-src 'self'`.

**i18n:** i18next + react-i18next with inline resources (English default, Italian), composed per area in `src/i18n/config.ts` from `src/i18n/resources/*`. The language choice persists in localStorage (`profile-portal:lang`); toggles live in the app header and the public layout. Human-facing dates render as `02 March 2026` / `02 marzo 2026` via `src/lib/dates.ts`; machine-facing dates stay ISO 8601.

**Backend/toolchain generations (aligned with Libra):** Express 5, Prisma 7 (`prisma-client` generator emitting TypeScript into `src/generated/prisma`, driven by `@prisma/adapter-pg`; datasource URL supplied by `packages/server/prisma.config.ts`), Zod 4 across all packages, Vite 8 (Rolldown).

## Claim Flow: Backend-Orchestrated

**Why the backend orchestrates** (not Auth0 Actions):
- The claim flow is a provisioning workflow, not an authentication event
- Requires sequential: Auth0 lookup → CiviCRM lookup → eligibility check → VIT ID match ladder → user creation or password reset → role assignment → password email
- Auth0 Actions have a 20-second timeout and would require embedding CiviCRM credentials inside Auth0
- Domain-specific eligibility logic benefits from version control, unit testing, and straightforward deployment

**VIT ID match ladder** (`packages/server/src/services/vit-id-match.ts`):
Shared 4-tier reconciliation run by the claim flow, the Manage Appointees dashboard, the Has VIT ID? lookup endpoint, and bio-email eligibility. Tiers run in order:
1. CiviCRM primary email → Auth0 email
2. Auth0 `app_metadata.civicrm_id` reverse lookup
3. CiviCRM secondary emails → Auth0 email
4. Normalized name match (case- and accent-insensitive, first + last)

Outcomes: `no-account`, `active`, `active-different-email`, `needs-review` (with reason). Returning fellows matched via tiers 2-4 get a password reset to their existing Auth0 email and IT is notified — the system never creates a duplicate Auth0 account for a fellow who already has a VIT ID.

**Where Auth0 participates:**
- Sends the password-setup email via the Authentication API
- Hosts the password-setup page (Universal Login)
- A Post-Login Action enriches tokens with user roles and CiviCRM contact ID

## Appointee Email Pipeline

Two appointee-facing emails share one infrastructure: the **VIT ID invitation** (sent when an appointee is accepted, invites them to claim) and the **bio & project description** request (sent 24h after a successful claim).

**Lifecycle derivation** (`packages/server/src/services/appointee-status.ts`):
Appointee status is a pure function of `(fellowshipAccepted, matchTier, invitationEvent, bioEmailEvent, formInvitationEvents)` — no separate state column in the database. The seven states are *Nominated*, *Nomination Sent*, *Form Submitted*, *Accepted*, *VIT ID Sent*, *VIT ID Claimed*, *Enrolled*. Returning fellows (match ladder finds an existing VIT ID) skip straight from *Form Submitted* → *VIT ID Claimed* the moment the fellowship is accepted.

**MJML template pipeline** (`packages/server/src/templates/emails/*.mjml`):
Authoring format is MJML 5 with shared `_head.mjml` / `_header.mjml` / `_footer.mjml` partials. `pnpm --filter @itatti/server build:email-templates` compiles each `*.mjml` to a checked-in `*.compiled.html` next to a hand-authored `*.txt` plaintext fallback. Production never loads MJML at runtime — it reads the pre-compiled HTML off disk. CI re-runs the compile on every PR and fails on a non-empty `git diff` to prevent stale compiled output.

**Tracking & idempotency** (`AppointeeEmailEvent` in Prisma):
Multiple rows may exist per `(fellowshipId, emailType)` so resend history is preserved; a partial unique index (migration `20260424170000`) allows only one *in-flight* row (`PENDING`/`SENDING`) per pair, and dashboard state reads the latest row. Prior to v0.8.0 the key was `(contactId, academicYear, emailType)`; that assumed CiviCRM's "one fellowship per appointee per year" policy was a schema invariant, which it isn't. `contactId` and `academicYear` stay as non-unique audit columns.

**Dispatch paths:**
- **Manual send** (Angela clicks Send in the Manage Appointees modal) — goes through `sendVitIdInvitationManually` / `sendBioEmailManually`.
- **Daily cron** (`dispatchPendingEmails`, 09:00 Europe/Rome) — dispatches only bio-email rows. VIT invitations are manual-only; the cron filters them out by `emailType`. This filter is load-bearing and has a dedicated regression test.

Both paths use an atomic `updateMany(PENDING → SENDING)` guard so concurrent cron + manual sends cannot double-deliver. Upstream (CiviCRM) fetch failures revert to `PENDING` and defer to the next run; only SES-level rejections mark `FAILED`.

**Dev-only preview routes** (`/__dev__/email-preview/*`) render the real compiled HTML inline with no auth, gated on `NODE_ENV !== 'production'`. Lets developers iterate on templates without triggering real sends.

## Appointee Forms

Form definitions live in `@itatti/shared` so the public renderer, admin archive, server validation, and PDF generation all read the same schema. `FORM_REGISTRY` keeps retired definitions resolvable for existing invitations while `getFormsForFellowship()` returns only active definitions matching the CiviCRM appointment and, when configured, the raw CiviCRM fellowship value for new link generation.

The current active Full year Fellow memorandum is `fellow-memorandum-v3`. Short-term Fellow appointment rows have separate active term templates for standard term fellowships, Dumbarton Oaks, and Graduate Fellows, selected from raw `Fellowship` values returned by CiviCRM. These forms share reusable title/country option constants, section icons, layout metadata, split legal-address fields (`legalStreetAddress`, `legalSupplementalAddress`, `legalCity`, `legalPostalCode`, `legalStateProvince`, `legalCountry`), required mobile phone, select-driven status fields, and repeatable child rows, but carry fellowship-specific Grant Information text. The original `fellow-memorandum` and `fellow-memorandum-v2` remain inactive so archived submissions and regenerated PDFs preserve their original prompt surface.

Submitted responses remain JSON. Server-side Zod validation is built from the submitted invitation's `formType`; select and radio fields must match their declared options, and repeatable child rows must be complete once added. The notification worker also resolves the submitted `formType` before generating the two PDF attachments. The first attachment is Memorandum; the second uses the grant-section label from that form version, which keeps retired Grants & Resources PDFs and active Grant Information PDFs aligned with the form the appointee actually submitted.

## Security

| Concern | Approach |
|---------|----------|
| JWT verification | `express-jwt` + `jwks-rsa`, RS256, issuer + audience checks |
| Authorization | Server-side RBAC middleware on every protected route |
| Account enumeration | Identical response body, status code, and timing on claim endpoint |
| Secrets | Environment variables, validated at startup via Zod, never logged |
| Input validation | Zod schemas for env vars; request body validation in route handlers |
| CSRF | Bearer token auth (no cookies) — no CSRF risk |

## Auth0 Login Page

A custom Page Template (Liquid) adds a "Claim your VIT ID" link below the Auth0 login widget, pointing to our `/claim` route. The template file is at `auth0/page-template.html`.
