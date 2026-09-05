# Auth0 tenant configuration

This directory captures the parts of the Auth0 tenant that are code:
`post-login-action.js` (the Post-Login Action, documentation copy — the live
Action is edited in the dashboard) and `page-template.html` (the Universal
Login page template). Everything else lives only in the dashboard. This file
is the checklist of that dashboard-held state, so the tenant can be audited
for drift or reconstructed (for example, to stand up a staging tenant)
without working from memory.

Secrets are never recorded here — only names, identifiers, and settings.
Values marked `→ env` are consumed by the app through the environment
variable named next to them; the deployed VM `.env` is their source of truth.

## Reproducibility: export the tenant periodically

The durable fix for dashboard drift is a periodic export with the
[Auth0 Deploy CLI](https://github.com/auth0/auth0-deploy-cli):

```bash
npx a0deploy export --format yaml --output_folder auth0/tenant \
  --config_file auth0/a0deploy.config.json
```

Committing that export (secrets are excluded by the tool by default — review
the diff before committing anyway) makes drift visible in code review and the
checklist below mostly self-verifying. Until that is set up, verify the
checklist by hand after any dashboard change.

## Checklist of dashboard-held configuration

### 1. SPA Application (React frontend)

- Application type: Single Page Application.
- Client ID → env `PUBLIC_AUTH0_CLIENT_ID`.
- Allowed Callback URLs: the production portal origin + `/callback`
  (→ env `PUBLIC_AUTH0_CALLBACK_URL`), plus the dev equivalents.
- Allowed Logout URLs / Allowed Web Origins: the same origins.
- Refresh Token Rotation: enabled (the SPA keeps tokens in memory only and
  relies on rotating refresh tokens).
- Grant types: Authorization Code + Refresh Token.

### 2. M2M Application (backend → Management API)

- Client ID / secret → env `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`.
- Authorized for the **Auth0 Management API**. The server
  (`packages/server/src/services/auth0.service.ts`) calls: user lookup by
  email, user create (with `app_metadata`), user read including
  `app_metadata`, role list, role's-users list, user's-roles list, and role
  assign/remove. Record the exact scope set granted in the dashboard here the
  next time it is touched; if a server change adds a Management API call,
  extend the grant AND this list.
- The password-setup email is NOT a Management API call — it uses the
  Authentication API (`dbconnections/change_password`), which needs no scope,
  only the database connection name (env `AUTH0_CONNECTION`).

### 3. API (JWT audience)

- Identifier → env `AUTH0_AUDIENCE` / `PUBLIC_AUTH0_AUDIENCE`.
- Signing algorithm: RS256 (the server pins RS256; HS256 tokens are rejected).

### 4. Database connection

- Name → env `AUTH0_CONNECTION` (default `Username-Password-Authentication`).
  Fellows accounts are created on this connection by the claim flow; its
  password policy is the one fellows see on the password-setup page.

### 5. Enterprise connection

- Microsoft Entra ID for `@itatti.harvard.edu` staff sign-in.

### 6. Roles (RBAC)

Names are matched exactly in code (`packages/shared/src/constants/roles.ts`)
— casing matters. Role IDs are consumed by the server:

| Role name | Role ID env var |
|-----------|-----------------|
| `fellows` | `AUTH0_FELLOWS_ROLE_ID` |
| `fellows-current` | `AUTH0_FELLOWS_CURRENT_ROLE_ID` |
| `fellows-admin` | — (checked by name in tokens) |
| `staff-IT` | — (checked by name in tokens) |

RBAC must be **enabled** on the API (roles in tokens) for the Post-Login
Action's role enrichment to have anything to read.

### 7. Post-Login Action

- Deployed in Actions → Flows → Login; source of truth for its code is
  `auth0/post-login-action.js` in this directory. After editing the file,
  paste and deploy in the dashboard — they drift otherwise.
- Custom claims namespace → env `PUBLIC_AUTH0_NAMESPACE`
  (`https://auth0.itatti.harvard.edu`).

### 8. Universal Login page template

- Deployed under Branding → Universal Login; source of truth is
  `auth0/page-template.html` (adds the "Claim your VIT ID" link).

### 9. Tenant settings worth pinning

- Default directory: the database connection above.
- Email provider: Auth0's built-in sender is used for password-setup emails
  triggered by the claim flow; if a custom email provider is ever configured,
  record it here.
