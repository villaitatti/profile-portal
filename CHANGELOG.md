# Changelog

## [0.7.0] - 2026-04-22

### Added
- **VIT ID match ladder** — a new 4-tier matching system catches returning appointees whose email changed. The Manage Appointees dashboard and Has VIT ID? page now recognize a fellow's existing VIT ID even when their current CiviCRM email doesn't match the one on their Auth0 account. Tiers run in order: primary email → Auth0 `civicrm_id` metadata → CiviCRM secondary emails → normalized name match (case- and accent-insensitive).
- **Two new VIT ID statuses on the Manage Appointees page:**
  - **Active (different email)** — amber pill when a fellow's VIT ID is found under a different email than CiviCRM's current primary. The row shows which email the VIT ID is under so staff can eyeball the match.
  - **Needs review** — amber pill with a clickable info icon when the match is ambiguous (name collision, primary/civicrm_id conflict, duplicate CiviCRM contact, or two Auth0 accounts sharing data). The row expands to list the candidate accounts; staff decide which is canonical.
- **Info icons** on every status badge with plain-language "what's happening" and "what to do" copy. Hover on desktop, tap on mobile. Works on both the Manage Appointees and Has VIT ID? pages via a shared `VitIdStatusBadge` component.
- **Has VIT ID? page rewritten** to use server-side search with 400ms debounce. One endpoint (`GET /api/admin/vit-id-lookup?q=...`) handles both email-style queries (full reverse ladder) and name-style queries (substring match). Pasting a fellow's new email now finds their VIT ID stored under their old email.
- **Claim flow is now ladder-aware.** When a fellow tries to claim a VIT ID under a new email, the claim flow runs the full 4-tier ladder against CiviCRM emails and Auth0 metadata. If it finds an existing account, a password reset goes to the OLD Auth0 email (the one they can log into) and IT receives a notification. No duplicate Auth0 account is created. If the ladder is ambiguous, IT gets an email with the candidate accounts and no automatic action is taken. Every returning-fellow or needs-review claim writes a `vitIdClaim` audit row, independent of SES success.
- **Bio-email eligibility uses the ladder.** The dashboard "has VIT ID" flag and backend `evaluateBioEmailEligibility` now agree: a returning fellow matched via `civicrm_id` or secondary email is eligible for the bio email (previously they'd show "has VIT ID" in the UI but fail with `no_vit_id` on send).
- **Observability log** on every Manage Appointees page load with counts by status, match tier (primary-email / civicrm-id / secondary-email / name), and needs-review reason. Use this to see how often each tier fires in production.

### Changed
- **Manage Appointees page sort default** is now `appointment asc → last name asc`. Fellows are grouped by role type (Fellow, Visiting Fellow, Visiting Professor, ...) and alphabetical within each group. Amber and red badges continue to provide the attention signal; sort is for scanning.
- **Manage Appointees summary bar** now shows 5 cards: Total, Needs Review, Different Email, Needs Account, Active. Previously only Total, Needs Account, Active.
- **Has VIT ID? page** no longer shows the full user table — one unified search box handles every case. Auth0 email is visible on every result card so staff can reference it at a glance.
- **Root `pnpm test`** now runs tests across all workspaces (previously server-only). Web component tests gate CI.

### Fixed
- Fellows whose CiviCRM email changed between fellowships no longer appear as "No Account" on the dashboard when they already have a VIT ID under an older email.
- The claim flow no longer creates a duplicate Auth0 account for returning fellows who have a VIT ID under an older email.
- Bio email dispatch no longer silently skips returning fellows whose CiviCRM primary email doesn't match their Auth0 email.
- When a CiviCRM email is on multiple contacts (duplicate contact), the system surfaces the ambiguity instead of picking one at random.
- Two Auth0 accounts that accidentally share an email or `civicrm_id` now surface as `needs-review` instead of silently routing to whichever was enumerated last.

### Removed
- Client-side Auth0 user list download on the Has VIT ID? page (superseded by server-side search). The `/api/admin/users` endpoint, `listAllUsers` service function, and `Auth0UserListItem` shared type are all retired.

## [0.6.0] - 2026-04-17

### Added
- **Automated Bio & Project Description email.** After an Appointee successfully claims their VIT ID, a tracked email event is enqueued and dispatched 24h later by a daily cron (09:00 Europe/Rome). The email asks for a short biography and project description via the existing Jira JSM form. Tracking is per `(contactId, academicYear)` so returning Appointees with a new fellowship correctly receive a fresh email.
- **Bio email status column** on the Manage Appointees page with color-coded pills (`—` none, yellow `Pending`, green `Sent` with timestamp, red `Failed`). Sortable alongside other columns.
- **Manual "Send bio email" button** on each Appointee row. Visible only when a VIT ID exists, a current or accepted upcoming fellowship is on file for the target academic year, and no email has been sent yet for that `(contactId, academicYear)` pair. Clicking opens a confirmation dialog and dispatches immediately via the same code path as the cron.
- **New Prisma model `AppointeeEmailEvent`** with enums `AppointeeEmailType` and `AppointeeEmailStatus` (`PENDING`/`SENDING`/`SENT`/`FAILED`/`SKIPPED`). Unique constraint on `(contactId, academicYear, emailType)` guarantees idempotency.
- **Atomic concurrency guard.** Dispatch uses `updateMany` PENDING→SENDING with `affectedRows=1` check so concurrent cron + manual sends cannot double-deliver. Upstream (CiviCRM) fetch failures revert to `PENDING` and defer to the next run; only SES-level rejections are marked `FAILED`.
- **Environment configuration for email behavior:**
  - `APPOINTEE_EMAIL_CRON_ENABLED` (default `false`) — toggle the daily dispatch cron independently of `AUTOMATIONS_ENABLED`.
  - `APPOINTEE_EMAIL_REDIRECT_TO` (dev-only) — route all outgoing bio emails to a single developer inbox. Enforced empty in production via a `loadEnv()` safety check.
  - `APPOINTEE_EMAIL_BCC` — comma-separated BCC list for every bio email (Angela + Andrea in production).
- **Eligibility helpers.** New `pickBioEmailTargetYear()` and `academicYearLabelForFellowship()` in `utils/eligibility.ts` to select the right fellowship year for the bio email (current wins; otherwise earliest accepted upcoming).

### Changed
- `claim.service.ts` now enqueues the bio email (24h delay) after a successful self-service VIT ID claim, gated on a valid current/upcoming target year.
- `fellows.service.ts` dashboard payload includes a batched `bioEmail` summary per Appointee (no N+1); the frontend uses it for the new pill + button.

## [0.5.0] - 2026-04-14

### Added
- **VIT ID claim audit log.** Every successful claim is recorded with fellowship status, roles assigned, and timestamp. New admin page at `/admin/claims` with sortable, searchable table and detailed instructions for IT staff.
- **JSM organization management.** Fellows are automatically added to "I Tatti Former Appointees" and (if current) "I Tatti Current Appointees" organizations on both Atlassian Cloud JSM sites when they claim their VIT ID. Customer records are created with full names from CiviCRM.
- **AWS SES email notifications.** Admin receives an email every time a fellow claims a VIT ID, including fellowship status and roles assigned.
- **Annual automations.** Two cron jobs (July 1 cleanup + July 2 new cohort onboarding) automatically rotate `fellows-current` Auth0 role and JSM Current Appointees organization membership at the academic year boundary. Both use dry-run/execute pattern.
- **Backfill endpoint.** One-time admin action to add all pre-existing fellows to JSM organizations retroactively.
- **Automations admin page** at `/admin/automations` with instruction callout, preview/execute buttons for each automation, and expandable run history.
- **Generic Auth0 role management.** New `assignRole` and `removeRole` methods for managing arbitrary Auth0 roles.
- New sidebar entries: "Claim Log" and "Automations" under VIT ID Administration.

### Changed
- VIT ID claim flow now assigns `fellows-current` role for current-year fellows and fires JSM organization membership + email notification asynchronously (fire-and-forget) after the claim record is persisted.

## [0.4.4] - 2026-04-13

### Fixed
- Execute Sync button no longer uses green ("safe") color for a destructive action. Restyled to primary crimson with a confirmation dialog summarizing pending changes before execution. Dry Run is now a secondary outline button.
- Collapsed sidebar icons now show a tooltip on hover identifying each navigation item.
- Claim page headline changed from "VIT ID — Self Service" to "Welcome to I Tatti" with context about eligibility and what to expect after submitting.
- Claim form success message now includes a timeline hint and spam-folder reminder.
- Profile page field labels bumped from 0.72rem to 0.78rem for readability.
- SCIM configuration error banner now shows user-friendly copy instead of raw environment variable names.
- Sync diff stats now include icons alongside color so status categories are distinguishable without relying on color alone.

### Changed
- Card radii normalized to `rounded-2xl` across claim forms, sync page panels, and warning banners.
- Button shapes standardized to `rounded-full` across claim forms and pagination controls.
- HasVitIdPage table cell padding aligned to `px-4` to match all other tables.
- Year filter dropdown now shows "All years" at the top instead of the bottom.
- EmptyState component fixed double bottom margin on icon wrapper.
- Dashboard app card image hover scale reduced from 1.05 to 1.02.

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
