# I Tatti Profile Portal

A single portal application for I Tatti staff and appointees (fellows). Users log in via Auth0, view their profile, access role-filtered internal applications, and (for appointees) claim their VIT ID credentials.

## Quick Start

```bash
# Install dependencies
pnpm install

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
- **Role-Based Sections** — Sidebar and content driven by Auth0 roles (`fellows`, `fellows-current`, `staff-it`)
- **My Profile** — Read-only CiviCRM profile data (falls back to Auth0 profile for staff)
- **Applications Catalog** — Internal apps filtered by user roles
- **Admin Section** — `staff-it` users manage the applications catalog and assign role visibility
- **Claim VIT ID** — Self-service flow: email → CiviCRM eligibility check → Auth0 account creation
- **Help Form** — Creates a Jira Service Management ticket for manual assistance

## Auth0 Setup

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
| `staff-it` | IT staff with admin access |

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

## Assumptions

1. CiviCRM API v4 REST is enabled with the `authx` extension
2. Auth0 database connection is named `Username-Password-Authentication`
3. Jira SM uses REST API with Basic auth (email + API token)
4. Application logos are stored as URLs (not file uploads)
5. Auth0 custom claim namespace: `https://itatti.harvard.edu`
