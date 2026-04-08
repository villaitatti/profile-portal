# Changelog

## [0.2.0] - 2026-04-08

### Added
- **Atlassian SCIM sync.** Sync users and groups from Auth0 to Atlassian Cloud via the SCIM API. Three-phase reconciliation engine: fetch Auth0 state, fetch Atlassian SCIM state, compute diff. Dry-run preview before every execution. Real-time SSE progress bar. Full audit log with search, filter, and JSON export.
- Admin dashboard at `/admin/sync` with role-group mapping table, dry-run/execute workflow, and sync history.
- Short-lived SSE tokens for secure EventSource authentication (avoids exposing JWTs in query strings).
- Database-level concurrency guard using Prisma serializable transactions with 30-minute lease TTL.
- Inactive user reactivation: users deactivated in Atlassian are automatically reactivated when re-added to an Auth0 role.
- Dry-run replay prevention: each dry run can only be executed once.
- `DEPLOYMENT.md` with dev server setup, operational guide, and troubleshooting.
- 26 new tests (16 for reconciliation engine, 10 for SCIM client including 429 retry behavior).

### Fixed
- Auth0 domain added to CSP `frame-src` for silent token renewal (was blocking `getAccessTokenSilently()` iframe).
- Removed incorrect `/scim/v2/` prefix from Atlassian SCIM API paths.

## [0.1.0] - 2026-04-01

### Added
- Initial release: Auth0 login, role-based dashboard, profile page, applications catalog, fellows management, claim VIT ID flow, Jira SM help tickets.
