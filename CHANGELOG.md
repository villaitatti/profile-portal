# Changelog

## [0.4.3] - 2026-04-10

### Changed
- Authenticated dashboard, profile, and admin screens now use warmer neutral surfaces, darker secondary text, and larger body typography for better readability.
- Sidebar spacing and chrome were tightened so navigation feels quieter and the content area leads visually.
- Shared page headers, empty states, dialogs, comboboxes, and admin tables/forms were realigned to the updated legibility-focused design system.
- Dashboard content now uses a fuller profile card and clearer credential guidance above the applications grid.

### Added
- Route-specific skeleton loaders for the dashboard, profile, applications catalog, application form, fellows management, Atlassian mappings, and Atlassian sync pages.

### Fixed
- Root `pnpm build` no longer fails by invoking a nonexistent `@itatti/shared` build script.

## [0.4.2] - 2026-04-10

### Changed
- Dashboard profile card replaced with a compact welcome banner so the application grid is the visual anchor of the page.
- Card and popover backgrounds tinted from pure white to warm `#fefcfb` for brand cohesion.
- Public claim page header now shows the I Tatti logo instead of text-only.
- AppHeader no longer renders an invisible spacer on desktop.
- Sidebar version text bumped from 10px to readable size.
- "Log in with" label renamed to "Authentication" on the app form.
- Sync page description simplified (removed "via SCIM" jargon).

### Fixed
- Delete confirmation in Applications Catalog now uses the shared ConfirmDialog instead of the native browser `confirm()`.
- Help request form now shows an error message on API failure instead of silently displaying success.
- Fellows table now paginates at 25 rows with Previous/Next controls and a count indicator.

### Added
- Global `:focus-visible` outline style using the primary crimson color for keyboard navigation.
- `.impeccable.md` design context file for future design skill runs.

## [0.4.1] - 2026-04-09

### Added
- Instructions panel on the Manage Group Mapping page with guidance on how to create and sync groups, including a link to the Atlassian Cloud admin console.
- Auth0 and Atlassian brand logos next to dropdown labels.
- `displayValue` and `disallowChars` props on SearchableCombobox for better "create new" UX and input validation.

### Changed
- Mapping form now uses horizontal layout with Auth0 and Atlassian dropdowns side by side, connected by a link icon.
- "Added On" date format changed to `9 Apr 2026, 16:55` (day month year time).
- "Added By" now reads the admin's full name from the Auth0 JWT access token (requires an updated Post-Login Action).

### Fixed
- **"Added By" column blank.** Auth0 access tokens now include the user's name via a new custom claim in the Post-Login Action. The server reads `AUTH0_NAMESPACE/name` from the JWT.
- **Combobox empty after "Create new".** The SearchableCombobox now shows the new group name via the `displayValue` prop instead of resetting to placeholder.
- **Spaces allowed in group names.** The Atlassian group dropdown now blocks space characters via `disallowChars=" "`.

## [0.4.0] - 2026-04-09

### Added
- **Searchable combobox component.** Modern dropdown with type-to-search, keyboard navigation, and "create new" option. Used for both Auth0 roles and Atlassian groups on the mapping page.
- **Confirmation dialog component.** Reusable Radix Dialog for destructive actions with danger variant styling.
- **Atlassian groups endpoint** (`GET /api/admin/sync/groups`). Returns SCIM managed groups for the searchable dropdown with dev mode mock.
- **"Added By" audit trail.** New `createdBy` column on role-group mappings, populated from the admin's JWT email. Prisma migration included.
- 16 new frontend tests (SearchableCombobox, ConfirmDialog, mappings page) and 5 new backend tests (groups endpoint, createdBy, atlassianGroupId).

### Changed
- **Manage Group Mapping page** (`/admin/atlassian/mappings`) completely redesigned: two-card layout (add form + mappings table), searchable comboboxes replace native dropdowns, table now shows 6 data columns (Auth0 Role, Atlassian Group, Auth0 Role ID, Atlassian Group ID, Added By, Added On).
- Selecting an existing Atlassian group now resolves the group ID immediately. "new (will be created)" only appears for genuinely new groups.
- Delete mapping now requires confirmation dialog.
- Add form is compact (max-w-xl) instead of full-width stretching.

### Fixed
- **Bug: "new (will be created)" on existing groups.** Previously, typing an existing group name (e.g., "staff-it") always showed "new (will be created)" because the frontend never looked up existing SCIM groups. Now the dropdown fetches and resolves group IDs on selection.

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
