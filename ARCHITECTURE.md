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

## Database: PostgreSQL + Prisma ORM

- PostgreSQL for relational data (applications catalog, fellow invite tracking)
- Prisma ORM provides type-safe queries and versioned migrations
- PrismaClient singleton with global caching for dev hot-reload

## Frontend: React + Vite + shadcn/ui + Tailwind CSS v4

**Why shadcn/ui** (not MUI, Chakra, Mantine):
- Components are copied into the project — full ownership and customizability
- Built on Radix UI primitives with a clean, neutral aesthetic
- Ships a composable Sidebar component with collapse support
- Easy to customize CSS variables for institutional branding

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

**Lifecycle derivation** (`packages/shared/src/appointee-status.ts`):
Appointee status is a pure function of `(fellowshipAccepted, matchTier, invitationEvent, bioEmailEvent)` — no separate state column in the database. The five states are *Nominated*, *Accepted*, *VIT ID Sent*, *VIT ID Claimed*, *Enrolled*. Returning fellows (match ladder finds an existing VIT ID) skip straight from *Nominated* → *VIT ID Claimed* the moment the fellowship is accepted.

**MJML template pipeline** (`packages/server/src/templates/emails/*.mjml`):
Authoring format is MJML 5 with shared `_head.mjml` / `_header.mjml` / `_footer.mjml` partials. `pnpm --filter @itatti/server build:email-templates` compiles each `*.mjml` to a checked-in `*.compiled.html` next to a hand-authored `*.txt` plaintext fallback. Production never loads MJML at runtime — it reads the pre-compiled HTML off disk. CI re-runs the compile on every PR and fails on a non-empty `git diff` to prevent stale compiled output.

**Tracking & idempotency** (`AppointeeEmailEvent` in Prisma):
Unique constraint is `(fellowshipId, emailType)` — one invitation row and one bio row per fellowship, forever. Prior to v0.8.0 the key was `(contactId, academicYear, emailType)`; that assumed CiviCRM's "one fellowship per appointee per year" policy was a schema invariant, which it isn't. `contactId` and `academicYear` stay as non-unique audit columns.

**Dispatch paths:**
- **Manual send** (Angela clicks Send in the Manage Appointees modal) — goes through `sendVitIdInvitationManually` / `sendBioEmailManually`.
- **Daily cron** (`dispatchPendingEmails`, 09:00 Europe/Rome) — dispatches only bio-email rows. VIT invitations are manual-only; the cron filters them out by `emailType`. This filter is load-bearing and has a dedicated regression test.

Both paths use an atomic `updateMany(PENDING → SENDING)` guard so concurrent cron + manual sends cannot double-deliver. Upstream (CiviCRM) fetch failures revert to `PENDING` and defer to the next run; only SES-level rejections mark `FAILED`.

**Dev-only preview routes** (`/__dev__/email-preview/*`) render the real compiled HTML inline with no auth, gated on `NODE_ENV !== 'production'`. Lets developers iterate on templates without triggering real sends.

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
