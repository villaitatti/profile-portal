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
- Requires sequential: Auth0 lookup → CiviCRM lookup → eligibility check → user creation → role assignment → password email
- Auth0 Actions have a 20-second timeout and would require embedding CiviCRM credentials inside Auth0
- Domain-specific eligibility logic benefits from version control, unit testing, and straightforward deployment

**Where Auth0 participates:**
- Sends the password-setup email via the Authentication API
- Hosts the password-setup page (Universal Login)
- A Post-Login Action enriches tokens with user roles and CiviCRM contact ID

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
