# Changelog

## [0.3.0] - 2026-04-09

### Added
- **Sidebar redesign.** Restructured navigation into 4 clear sections: main nav, VIT ID Administration, Portal Settings, and Atlassian Cloud. All admin pages now accessible directly from the sidebar.
- **"Has VIT ID?" page** (`/admin/has-vitid`). Quick-lookup search box with yes/no answer, plus expandable full user table. Lazy-loads from Auth0 Management API with 5-minute client-side cache.
- **Atlassian page split.** "Manage Group Mapping" (`/admin/atlassian/mappings`) and "Sync Users to Atlassian Cloud" (`/admin/atlassian/sync`) are now separate pages with cross-page navigation CTAs.
- **Mobile responsive sidebar.** Hamburger menu at <768px with drawer overlay, backdrop, and auto-close on navigation.
- **Frontend test infrastructure.** Vitest + @testing-library/react set up in the web package. 4 sidebar role-visibility tests.
- Backend `GET /api/admin/users` endpoint with Auth0 pagination and dev mode mock data. 3 new backend tests for `listAllUsers()`.
- ARIA navigation landmarks, aria-labels on collapsed sidebar, and keyboard accessibility.

### Changed
- Sidebar section spacing reduced for tighter visual hierarchy.
- Renamed "VIT ID Admin" to "VIT ID Administration", "Fellows" to "Manage Appointees", "IT Admin" to "Portal Settings".
- Removed admin hub page (`/admin`). All admin functions now have direct sidebar entries.

### Removed
- `AdminPage.tsx` (card-based admin hub, replaced by direct sidebar navigation).
- `SyncDashboardPage.tsx` (split into AtlassianMappingsPage and AtlassianSyncPage).

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
