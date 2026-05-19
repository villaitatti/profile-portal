# Changelog

## [0.16.0] - 19 May 2026 - Image upload with crop + searchable role tags

### Added
- **Image upload with 16:9 crop in the application catalog.** Admins drag-and-drop or browse for a screenshot, crop it to the exact card ratio using an interactive cropper, and the server optimizes it to 800x450 WebP with a blur placeholder for instant dashboard loading. Images are stored locally with a persistent Docker volume.
- **Image gallery.** When adding or editing an app, admins can browse screenshots already uploaded to other applications and reuse them (creates an independent copy).
- **Searchable role tags.** The role selector is now a type-to-search multi-select with tag pills, replacing the scrollable checkbox list. Matches the existing SearchableCombobox pattern.
- **Blur placeholder on dashboard cards.** App cards show a blurry instant preview while the full image loads, eliminating the gray-box flash.
- **15 integration tests** for the upload endpoint covering happy paths, error codes (413/400/422/507/503), path traversal protection, and authorization.

### Changed
- Application catalog form redesigned: image URL text input replaced with drag-drop uploader + gallery, checkbox role list replaced with tag-based combobox.
- Docker Compose adds a `uploads_data` named volume so uploaded images persist across container rebuilds.
- Orphan image cleanup: replacing or deleting an app's image removes the old file from disk (DB-first ordering prevents data loss on failure).

### Security
- Upload filenames are random UUIDs (never user-supplied). MIME validation checks magic bytes. Images capped at 25 megapixels to prevent decompression bombs. Path traversal hardened with resolve + basename check in deleteImage. Static serving uses `X-Content-Type-Options: nosniff` and immutable cache headers.

## [0.15.3] - 19 May 2026 - Security hardening

### Changed
- **Docker container runs as non-root user.** Production container now uses `USER node` to reduce blast radius if a dependency vulnerability is exploited.
- **CI GitHub Action pinned by commit SHA.** `pnpm/action-setup` is now SHA-pinned to prevent supply chain tag-hijack attacks.

## [0.15.2] - 19 May 2026 - Application catalog supports "no authentication" option

### Added
- **"None (public)" authentication option in the application catalog.** Applications that don't require a login (like the I Tatti website) can now be marked as public. The dashboard displays "No login required" on these cards.
- **I Tatti Website added to the seed data.** Fresh database installs now include the public I Tatti website as a default application.

### Changed
- **Dashboard text restructured for clarity.** The web applications section now explains that some apps are available without credentials, with authentication methods described on a separate line.
- **PageHeader description simplified.** Removed credential-specific language from the dashboard header.

## [0.15.1] - 15 May 2026 - Larger fonts and profile images for better readability

### Changed
- **Root font size set to 18px.** All rem-based text across the site is now ~12% larger, improving readability on high-density displays.
- **Manage Appointees profile photos bumped to 64px.** Faces are now large enough to recognize at a glance in the table.
- **Manage Appointees table typography scaled up.** Column headers, fellow names, emails, badges, and sub-labels all increased 1–2px for comfortable scanning.
- **Shared badge components (AppointeeStatusBadge, VitIdStatusBadge) text bumped.** Pill labels and popover help text are slightly larger for legibility.

## [0.15.0] - 15 May 2026 - Form notification email gets branded MJML styling

### Changed
- **Form notification email now uses the branded template.** Admins receiving form submission emails now see the same I Tatti logo, layout, and institutional footer as VIT-ID and bio-project emails. Dark-mode support included.
- **Email MIME structure upgraded to multipart/alternative.** The notification now sends both a styled HTML body and a plaintext fallback alongside the PDF attachment, so every mail client renders something reasonable.
- **Plaintext body sourced from template.** The text/plain MIME part now comes from the `form-notification.txt` template (with token substitution) instead of inline string construction, ensuring HTML and plaintext stay in sync as the template evolves.

## [0.14.3] - 08 May 2026 - `/admin/forms` audit polish: a11y announcements, warning tokens, touch targets

### Changed
- **Submissions archive typography and hierarchy tightened.** Detail-pane section headings now sit on a subtle divider with wider letter-spacing; field values stepped up to the base 18px body size so the heading-to-value contrast is readable at a glance. The page's filter strip no longer sits inside its own card — the filters rest on the page surface so the list and detail panes read as the real content.
- **`/admin/forms` description no longer mentions internal PDF plumbing.** The header subtitle is now "All submitted appointee forms. Select a row to view the full response or download a PDF." — the "same generator as the notification email" implementation detail is gone.
- **List-row metadata no longer renders "— · 2025-2026" when a submission date is missing.** When `submittedAt` is null the row shows just the academic year. The detail pane drops the "Submitted —" line entirely in the same case.

### Fixed
- **Screen readers now announce `/admin/forms` state changes.** The error banner is a live `role="alert"`, the "no submissions match these filters" message is a `role="status"`, and a polite live region announces "Showing N of M submissions" as filters change. Filter bar selects gained explicit `id`/`htmlFor` pairs so the label association survives future layout refactors.
- **PDF icon button in list rows is now a real touch target.** Grew from 28×28 to 32×32 on fine pointers and 48×48 on coarse pointers (WCAG 2.5.5).
- **Retired-form banner and "Pending" bio-email pill no longer use hard-coded Tailwind yellow.** Both now draw from a new `--color-warning` / `--color-warning-foreground` / `--color-warning-border` token family, so future theme tweaks don't leave them stranded.

## [0.14.2] - 08 May 2026 - Form notification email lands the appointee name + SMTP header-injection defense

### Changed
- **Post-submit screen is now a clean "Thank you!" panel.** Previously the form title and privacy description still rendered above the success message, leaving appointees with a half-form, half-confirmation view. The page now hides the title block after a successful submit and closes with "You may now close this window."
- **Form notification email subject leads with the appointee name.** Replaced `Form Submitted: <form> — Fellowship <id> (<year>)` with `Form submitted by <Appointee Name> — <form> (<year>)`. Distinguishing info (the person) comes before program noise, and the internal CiviCRM fellowship id no longer appears in the subject line.
- **Form notification email body shows human-readable labels.** `Fellowship ID: <id>` and `Contact ID: <id>` now render as `Fellowship: <program name>` and `Appointee: <Full Name>`, resolved from CiviCRM at send time. When the CiviCRM lookup fails the email still ships with a degraded but usable body — no "Appointee:" line rather than a crash.

### Security
- **SMTP header injection is blocked at the email-service boundary.** Any untrusted string that reaches `sendFormNotificationEmail` is scrubbed of CR/LF, tab, C0 controls, DEL, and the Unicode line separators (U+0085, U+2028, U+2029) that some mail parsers treat as newlines. Non-ASCII subject lines are RFC 2047 encoded-word wrapped (UTF-8 + base64) so names like "François Élise" render correctly instead of as mojibake or truncated at the first 8-bit byte. Attachment filenames use RFC 2231 `filename*=UTF-8''` with an ASCII-sanitised fallback for legacy clients. Email body parts now ship as base64-UTF-8 instead of 7bit ASCII.
- **Notification email subject no longer logs as PII.** Server logs previously included the full subject (now containing the appointee name) on every send. Replaced with a constant identifier so appointee names don't leak into log aggregation.

## [0.14.1] - 08 May 2026 - Forms actually send again (pg-boss queue + post-submit UX fixes)

### Fixed
- **Appointees now see a "Thank you!" confirmation after submitting a form.** Previously, a successful submit immediately flipped the screen to "Form Already Submitted" with a message suggesting the form had been filled before, making successful submissions look like errors. The page now distinguishes between "opened an already-used link" (keeps the re-visit message) and "just submitted successfully" (shows the renderer's success state).
- **Form submission notification emails actually send now.** The pg-boss v10 upgrade introduced a breaking change — queues must exist before jobs can be sent to them, or the send silently returns null with no error. No queue was ever created, so every form submission since the forms feature shipped (v0.13.0) dropped its notification email. Queue creation now runs centrally for every registered queue during boot. A loud ERROR log also fires if a send ever returns null again so a future regression can't hide the same way.
- **Boot ordering closed the last silent-drop window.** The worker registration (and its queue creation) now awaits completion before the HTTP server accepts traffic. A submission arriving in the cold-start window used to race the worker and lose. Boot now fails fast if queue setup throws.
- **Server boots again.** The stricter await+process.exit around `registerFormNotificationWorker` surfaced a pre-existing pg-boss v10 assertion failure: the constructor rejects `expireInSeconds` values at or above 86400 (24h) with "expiration cannot exceed 24 hours". Our config set it to exactly 86400. Previously the error was swallowed by a fire-and-forget `.catch()` so pg-boss just quietly never started. Dropped `expireInSeconds` to 23 hours — within the valid range, functionally equivalent for a job-staleness cutoff.
- **Navigating between two different form links no longer carries the first link's "Already Submitted" state into the second.** React Router reuses the same component instance across `:token` changes; the page's status snapshot is now keyed by token so opening `/forms/A` (submitted) and then `/forms/B` (pending) correctly renders the fresh form.

### Changed
- **Already-submitted and invalid-link screens now point appointees to the staff member who sent them the form,** rather than a generic "contact the I Tatti office." Keeps Angela's email private while giving appointees a concrete next step (the person already in their nomination email thread).

## [0.14.0] - 07 May 2026 - Submissions archive at `/admin/forms`

### Added
- **Submissions archive at `/admin/forms`.** Angela now has a searchable, filterable home for every submitted appointee form. The page opens on the most recent submission by default, shows appointee + form title + submission date in a master-detail layout, and renders every answered field in the detail pane. The old form-registry view moved to `/admin/forms/templates` (linked from the page header).
- **Download PDF on every submission.** Both the list row (quick download) and the detail pane expose a PDF button. The download runs through the bearer-authenticated admin endpoint and produces the same content as the notification email attachment.
- **Deep-linkable submissions.** Filters and selected submission live in the URL (`?year=&formType=&q=&invitation=`), so a link to a specific response opens that row with the right filters applied.
- **Keyboard-navigable list.** Arrow keys move selection, Enter opens the detail pane, Home and End jump to the ends of the list. Focus stays in the list while scrolling with the arrows and only moves to the detail heading on Enter or click.

### Changed
- **`GET /api/admin/forms/invitations` now returns `{ items, facets }`.** Each item gains `contactName` (resolved server-side from CiviCRM with a 120s cache) and `formTitle` (from the registry, with `"(retired form: <id>)"` as the fallback when a form has been removed). Facets surface the distinct academic years and form types present in the archive so the filter dropdowns only show values with real data behind them.
- **Date fields render timezone-independently.** A small local-date parser replaces `new Date()` on `YYYY-MM-DD` strings so "24 Apr 2026" is always "24 Apr 2026", regardless of the admin's timezone.
- **`formatValue` rules are explicit.** `null` / `undefined` / `""` / `[]` render as "—", booleans as "Yes" / "No", zero as "0" (previously coerced to "—"), non-empty arrays as comma-joined, objects as JSON. Both the web walker and the PDF generator use the same rules, pinned by a shared fixture parity test.

### Fixed
- **Invitation tokens no longer leak through the admin archive.** `GET /api/admin/forms/invitations` used to include the public form token on every row. Tokens are the key to the unauthenticated `GET /api/forms/:token` endpoint that returns submitted response data; the admin archive has no reason to expose them. They are now omitted from the response.
- **CiviCRM transient empty responses no longer poison the name cache.** If `getFellowsWithContacts()` returns an empty list (a known Civi 200-with-empty-values failure mode), the cache skips storing it so the next request retries instead of labeling every row "Contact #<id>" for 120 seconds.
- **PDF download revokes the blob URL even on failure.** The `useDownloadFormPdf` hook wraps `URL.createObjectURL` / `revokeObjectURL` in try/finally so the object URL is always freed, even if the anchor click throws or the fetch rejects after the blob was created.
- **Cyclic / weird response values no longer crash the PDF render.** `formatValue` wraps `JSON.stringify` in try/catch on both the server PDF and web walker paths; unserializable values render as `[unserializable]` instead of bringing down the entire page.

### Removed
- **Dead `getFormPdfUrl` helper.** The client-side PDF URL builder in `packages/web/src/api/forms.ts` was incompatible with bearer authentication and had no live callers. Deleted in favor of the new `useDownloadFormPdf` hook.

## [0.13.3] - 06 May 2026 - Readable dates on Manage Appointees

### Changed
- **Dates in the Manage Appointees page now display as "24 Apr 2026"** in the Appointee Status and Form columns, replacing the locale-dependent numeric format that could be misread as month/day vs day/month.
- **The "Nomination sent" date picker uses the European day/month order** via `lang="en-GB"` so the native popup shows DD/MM instead of MM/DD.

## [0.13.2] - 06 May 2026 - Editing an address to "Temporary" no longer fails validation

### Fixed
- **Editing an address to "Temporary" no longer fails validation.** The update route still allowed the old "Billing" id (5) and rejected the new "Temporary" id (6), so switching an existing non-primary address to Temporary returned a validation error.

### Changed
- **Contact validation error messages no longer show internal numeric IDs.** Address and phone error messages now list the type names users actually see in the form ("Home, Work, Other, or Temporary" / "Phone or Mobile") instead of parenthesised database IDs.

## [0.13.1] - 06 May 2026 - Fix swapped "Temporary" / "Other" address location types

### Fixed
- **Address location types now match CiviCRM.** "Temporary" and "Other" were swapped — profiles showed "Temporary" for what CiviCRM stored as "Other" (and vice versa). Location type IDs now correctly map to CiviCRM's configuration (Home=1, Work=2, Main=3, Other=4, Temporary=6). Billing (id 5) is excluded from the selectable options.

### Changed
- **New phone numbers always use the Main location type.** Previously, phone creation cycled through location types to avoid duplicates; it now hardcodes Main so every phone lives in the same location category.

## [0.13.0] - 04 May 2026 - Form workflow: link generation, copy, nomination-sent actions

### Added
- **Form status column on Manage Appointees.** Angela can now see whether an appointee is ready for a form link, has no configured form, has a generated link, is waiting for submission, or has submitted the form.
- **Copy form link shortcut.** Generated form links can be copied directly from the Form column with a dedicated icon button and appointee-specific toast confirmation.
- **Nomination sent action.** The Actions menu now includes a "Nomination sent" action for generated links, opening a date picker prefilled with today and moving the form workflow into the waiting-for-submission state.

### Changed
- Form link generation is now limited to appointment types with configured forms. Non-Fellow appointment types are shown as "No Form" instead of allowing a link that cannot match a configured workflow.
- Form status colors now follow lifecycle semantics: "Ready" is neutral, generated links are slate, waiting is amber, submitted is green, and missing configuration is red.
- The appointee lifecycle popover now marks completed states with green check indicators so past steps are visually distinct from future steps.

### Fixed
- Invalid nomination sent dates are rejected before database writes instead of allowing impossible calendar dates through the form workflow.

## [0.12.2] - 30 April 2026 - Generate Form Link button + lifecycle info popup

### Added
- **Generate Form Link button** on the Manage Appointees page. Angela can generate invitation links for appointees and copy them to clipboard in one click. Previously this required an API call.
- **Appointee lifecycle info popup.** Each status badge now has an info icon that opens a diagram showing all 7 lifecycle stages with the current step highlighted.
- **Form notification email override.** New `FORM_NOTIFICATION_OVERRIDE_TO` env var redirects form submission notification emails to a specific address, even in dev mode. Enables local testing of the full email+PDF flow.

### Changed
- Pagination disabled when viewing a specific academic year (all fellows shown in one table). Pagination remains for the "All years" view with page size increased to 50.
- `FellowDashboardEntry` type now includes `fellowshipId` for form generation API calls.

## [0.12.1] - 30 April 2026 - Reject duplicate address location types with a clear error

### Fixed
- Server now rejects duplicate address location types (Home, Work, Temporary, Other) with a clear error message, matching CiviCRM's own constraint.
- Unhandled async error when CiviCRM is unavailable during duplicate type check now returns a proper 503 response.

### Changed
- Address form disables location types already in use (shown as greyed-out with "(in use)" label).
- "Add address" button hidden when all 4 location types are occupied.
- Reclassify dialog after primary change now only shows available (unused) types.
- Primary indicator copy replaced with star icon + explanatory text for both addresses and phone numbers.

## [0.12.0] - 30 April 2026 - Location type system for addresses

### Added
- **Location type system.** Users select Home, Work, Temporary, or Other when adding an address. The primary address is automatically labeled "Main" in CiviCRM. When switching primary, a reclassify dialog prompts the user to re-label the old primary.
- **CiviCRM error parsing utility.** All API errors now surface user-friendly messages instead of raw CiviCRM responses (duplicate entry, permission denied, not found).
- **Primary integrity guarantee.** After setting a new primary address, the system verifies no duplicate primaries exist in CiviCRM and cleans up if found.
- Toast notifications on all contact mutations (success and error feedback).
- Card entry animations (fade-in + slide-up) for addresses and phone numbers.
- Profile avatar display in the name card.

### Changed
- Address and phone section copy revised to explain what "primary" means for I Tatti correspondence.
- Address edit form now persists location type changes.
- Optimistic UI for address creation now shows the correct location type badge immediately.

### Fixed
- Unhandled promise rejections in address/phone action handlers.

## [0.11.1] - 29 April 2026 - Profile page layout tightening

### Changed
- Profile page layout: cards now display in a two-column grid (Name + Email top row, Addresses + Phone bottom row).
- Name card restyled to match other section cards (icon + title header pattern).
- Removed "Source: I Tatti Records (CiviCRM)" footer from profile page.
- IT contact email updated to it-help@itatti.harvard.edu.

## [0.11.0] - 29 April 2026 - Contact info self-service (address + phone CRUD on Profile)

### Added
- **Contact info self-service.** Fellows and staff can now manage their own addresses and phone numbers from the Profile page. Full CRUD with inline editing, preferred (primary) selection, and real-time validation.
- Address management: street, supplemental line, city, postal code, state/province (dynamic per country), and country selection. Country and state dropdowns fetched from CiviCRM reference data.
- Phone management: landline and mobile types, 7-digit minimum validation, preferred number toggle.
- Ownership verification (IDOR protection) on all mutation endpoints: update, delete, and set-preferred require the record to belong to the authenticated user's CiviCRM contact.
- Race-safe primary reconciliation: new records are created as non-primary, then promoted only if no existing primary is found.
- Optimistic UI updates with React Query for instant feedback on add/edit/delete/set-preferred actions, with automatic rollback on failure.
- 43 new server tests covering service layer and route handlers.

### Changed
- CiviCRM client error messages now include entity and action for easier debugging (e.g. `Address.get returned 500`).
- Mutation error responses use 503/CIVICRM_UNAVAILABLE instead of generic 500 to distinguish upstream failures from application bugs.

## [0.10.0] - 29 April 2026 - Appointee Forms system replaces Google Forms

### Added
- **Appointee Forms system.** Replaces Google Forms with an in-app token-based form workflow. Angela generates a unique link per appointee from the portal; the appointee fills the form without logging in; Angela receives an email notification with the responses as a PDF attachment. Full workflow: generate invitation → appointee submits → async PDF generation → email notification → admin can view/download responses.
- **Code-driven form definitions** in the shared package (`FormDef` type system). The fellowship acceptance form ships as the first definition. New forms are added by creating a TypeScript object in `form-registry.ts` with sections, fields, conditional visibility rules, and appointment type mapping.
- **Dynamic public form renderer** at `/forms/:token`. Handles all field types (text, textarea, email, date, select, radio, checkbox), conditional field visibility, client-side validation, and a success confirmation screen. No authentication required.
- **Server-side PDF generation** using `@react-pdf/renderer` (React.createElement API). Produces branded A4 PDFs with section headers, field labels/values, conditional field filtering, and a generation date footer.
- **pg-boss job queue** for async form notification processing. Embedded in the Express server, uses the existing PostgreSQL database. Retries 3x with 60s delay, archives after 7 days.
- **Admin form management routes** (`/api/admin/forms`): generate invitations (idempotent per fellowship+formType+year), list/filter invitations, view responses, download PDFs on demand, mark nomination as sent, reset invitations (new token, preserves audit trail).
- **Two new appointee lifecycle states**: `nomination-sent` (Angela sent the nomination letter) and `form-submitted` (appointee completed the required form). These appear between `nominated` and `accepted` in the pipeline, reflected in the AppointeeStatusBadge with distinct color treatments (slate and indigo).
- **Admin Forms reference page** (`/admin/forms`) showing all defined form definitions with their sections, fields, and appointment type badges.
- **React Query hooks** for all form endpoints: `useFormRegistry`, `useFormInvitations`, `useGenerateFormInvitation`, `useFormResponse`, `useResetFormInvitation`, `usePublicForm`, `useSubmitForm`.
- Countries constant list (240 entries) for nationality/country form fields.
- Sidebar "Forms" nav item under VIT ID Administration.

### Changed
- `computeAppointeeStatus()` now accepts `nominationSent` and `formSubmitted` flags and returns the new intermediate states before `accepted`.
- `fellows.service.ts` batch-loads form invitations per contact (single query, O(1) index lookup) and passes nomination/submission signals to the status computation.
- `FellowsManagementPage.tsx` appointee status sort order expanded from 5 to 7 states.
- `AppointeeStatusBadge` test expectations updated for new states.

### Database
- New `form_invitations` table with unique constraints on `token` and `(fellowship_id, form_type, academic_year)`. Index on `(status, academic_year)` for filtered admin queries.
- New `form_responses` table with 1:1 relation to `form_invitations` (unique on `invitation_id`).

### For contributors
- **No new env vars required.** Uses existing SES config and DATABASE_URL. pg-boss auto-creates its schema tables on first start.
- **Deploy requires** `prisma migrate deploy` before starting the server (new tables).
- `form-schema.ts` builds Zod validation schemas from FormDef at runtime (handles all field types, conditional fields made optional).
- `form-invitation.service.ts` uses atomic `WHERE status = 'pending'` guard on submit to prevent race conditions on double-click.
- Form notification worker uses pg-boss v10 `batchSize: 1` API with array iteration pattern.

### Known follow-ups
- File upload field type (photo, CV, grant letter) deferred to v1.1. Tracked in TODOS.md.
- Forms for non-Fellow appointment types blocked on Angela providing templates. Tracked in TODOS.md.
- Fellows Management page UI integration (per-row generate link button, copy-to-clipboard) not in this release.

## [0.9.0] - 28 April 2026 - `/admin/emails` audit trail

### Added
- **Admin Emails page** (`/admin/emails`). Audit trail of all appointee emails with three tabs: a filterable table of sent/pending/failed events with row-click drill-in drawer showing status, timestamps, failure reasons, SES message ID, and a re-rendered email preview; a templates reference tab with live iframe previews of both VIT ID Invitation and Bio & Project Description emails; and a "How emails work" reference tab documenting trigger logic for each email type.
- Email event drill-in shows recipient status warnings when the original contact was deleted from CiviCRM or has no first name on file, with placeholder-name rendering and amber info banners.
- React Query hooks for the three email admin endpoints with appropriate stale times (60s for event list, 5min for event previews, 10min for template previews) to reduce CiviCRM load.

## [0.8.0] - 23 April 2026 - Five-state appointee lifecycle + branded HTML emails

### Added
- **Five-state appointee lifecycle on Manage Appointees.** A new "Appointee Status" column tells Angela at a glance what step each appointee is on: *Nominated* (waiting on her external nomination-letter flow), *Accepted* (ready for the VIT ID invitation), *VIT ID Sent* (waiting on the appointee to claim), *VIT ID Claimed* (ready for the bio email), *Enrolled* (done). State is derived purely from `(fellowshipAccepted, VIT ID match tier, invitation event, bio email event)`. No manual transitions; Angela just acts on the chip she sees. Returning fellows (who already have a VIT ID) skip straight from Nominated → VIT ID Claimed the moment their fellowship is accepted.
- **New "Send VIT ID email" action.** When an appointee sits in *Accepted*, Angela clicks the crimson button, reviews the rendered email in a preview modal (To, BCC locked to `APPOINTEE_EMAIL_BCC`, full HTML body), and sends. The email goes to the appointee with Angela's office in BCC. The row flips to *VIT ID Sent* on the next dashboard refresh.
- **HTML-styled email for both appointee-facing emails.** MJML pipeline with a shared layout (I Tatti logo header, institutional-grey frame, white body card, footer with Florence address). Georgia serif body + Arial UI, squared 4px-radius crimson CTA button, dark-mode handling via `prefers-color-scheme` + meta tags, multipart/alternative plaintext fallback for spam scoring. Both the new VIT ID invitation and the existing bio & project description email ship together so the cohort sees consistent branding. Friendly sender display names in the inbox: "I Tatti - VIT ID" and "I Tatti - Bio & Project".
- **Email preview modal.** Replaces the old confirmation dialog for the bio email send and powers the new VIT invitation flow. Sandboxed iframe renders the real compiled HTML at full height. Inline error banners for preview-render failures (missing first name in CiviCRM → CiviCRM deep link) and send failures (Angela retries in place without reopening). CiviCRM 503s surface as "CiviCRM is temporarily unavailable. Try again in a moment." — a specific, actionable error instead of a generic server failure.
- **Dev-only email preview routes** at `/__dev__/email-preview/vit-id-invitation?firstName=…` and `/__dev__/email-preview/bio-project-description?firstName=…`. Renders the real compiled HTML inline, no auth, gated on `NODE_ENV !== 'production'`. Lets developers iterate on the MJML without triggering real sends.

### Changed
- **Page renamed from "Fellows Management" to "Manage Appointees"** to match the sidebar label. The year dropdown moves up next to a dynamic H2 subtitle ("2025–2026 Appointees" / "All appointees") — the year becomes the hero control. The Year column drops from the table (redundant with the subtitle).
- **Email-status query widened to ALL academic years** present in the dashboard scope (previously hardcoded to current + next). Past-year filters now surface their real send history when the data accumulates — no more silent blank pills.
- **Bio email send button now opens the same preview modal** as the new VIT ID action. Angela sees exactly what the appointee will receive before she hits Send.
- **`needs-review` rows disable both send buttons** with a tooltip pointing to the VIT ID Status column. Server-side endpoints also refuse these sends with `{reason: 'needs_review'}` — defense in depth.
- **CI runs the full monorepo test suite** (`pnpm -r test`) instead of server-only. Web-side component regressions now gate merges. A new CI step re-runs the MJML compile and fails if the committed `*.compiled.html` files are stale, so developers can't forget to regenerate after editing templates.

### Fixed
- **"We have already created your VIT ID" was a lie.** The previous copy contradicted the actual claim flow, which creates the Auth0 account on first claim. Reworded to "you will need an I Tatti ID (VIT ID) linked to this email address" — now the email describes what actually happens. Caught in outside-voice review.

### Database
- Add `VIT_ID_INVITATION` to the `appointee_email_type` enum.
- Rekey `appointee_email_events` from `(contactId, academicYear, emailType)` to `(fellowshipId, emailType)`. The old key assumed a business invariant ("one fellowship per appointee per year" is CiviCRM policy, not a schema constraint); keying by `fellowshipId` makes every fellowship its own lifecycle bucket. `contactId` and `academicYear` stay as non-unique columns for audit queries (you can still ask "what emails were sent in 2024-2025?" without a join). Migration includes a `DO $$` guard that refuses to run if the table is non-empty, so the documented "prod has zero rows" assumption can't silently fail.

### For contributors
- **New env vars**: `CLAIM_VIT_ID_URL` (URL the invitation CTA links to), `PORTAL_PUBLIC_URL` (origin for the email logo asset), `APPOINTEE_EMAIL_FROM_NAME_VIT_ID` and `APPOINTEE_EMAIL_FROM_NAME_BIO` (friendly inbox display names, default to "I Tatti - VIT ID" / "I Tatti - Bio & Project"). `APPOINTEE_EMAIL_BCC` is reused unchanged. All four new vars have sensible defaults except the URLs, which fail-fast at boot.
- **MJML 5 templates live at `packages/server/src/templates/emails/*.mjml`.** Run `pnpm --filter @itatti/server build:email-templates` after editing. The compiled HTML is checked in; production never loads MJML at runtime.
- **Shared `EmailPreviewModal` + `AppointeeStatusBadge` components** under `packages/web/src/components/shared/`. The modal reuses the existing radix Dialog primitive and renders HTML in a sandboxed iframe (`sandbox="allow-same-origin"`, no scripts).
- **Strict `escapeHtml()` guard** on template substitutions. CiviCRM first names containing `<`, `>`, `&`, `"`, or `'` now render correctly in HTML output (plaintext path unchanged). Pre-landing review caught this before ship.
- **Cron filter** (`dispatchPendingEmails`) excludes `VIT_ID_INVITATION` rows. The daily cron only dispatches bio emails. VIT invitations are manual-only (Angela clicks Send). The filter is the load-bearing guard; there's a dedicated regression test.
- **Test suite**: 351 tests total (277 server + 74 web), +70 new since main. Coverage on the new surface area ≈ 90%.

### Known follow-ups
- Bio-email route should return 503 for `civicrm_unavailable` to match the VIT route (currently returns generic 500). Cosmetic UX drift, no correctness bug. Tracked in TODOS.md.
- Manual-send retry paths have a tiny delete+create race window (worker could insert a row between the delete and the re-enqueue). No data-integrity impact; close via transaction or upsert later. Tracked in TODOS.md.
- Claim-page visual review — the appointee's first interactive portal impression after clicking the CTA is the claim page; worth aligning it with the email's institutional design. Tracked in TODOS.md.

## [0.7.0] - 22 April 2026 - VIT ID match ladder (returning appointees with changed emails)

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

## [0.6.0] - 17 April 2026 - Automated Bio & Project Description email

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

## [0.5.0] - 14 April 2026 - VIT ID claim audit log + JSM organization management

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

## [0.4.4] - 13 April 2026 - UX polish (sync destructive-action color, tooltips, copy)

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

## [0.4.3] - 10 April 2026 - Readability refresh (warmer surfaces, bigger type, skeleton loaders)

### Changed
- Authenticated dashboard, profile, and admin screens now use warmer neutral surfaces, darker secondary text, and larger body typography for better readability.
- Sidebar spacing and chrome were tightened so navigation feels quieter and the content area leads visually.
- Shared page headers, empty states, dialogs, comboboxes, and admin tables/forms were realigned to the updated legibility-focused design system.
- Dashboard content now uses a fuller profile card and clearer credential guidance above the applications grid.

### Added
- Route-specific skeleton loaders for the dashboard, profile, applications catalog, application form, fellows management, Atlassian mappings, and Atlassian sync pages.

### Fixed
- Root `pnpm build` no longer fails by invoking a nonexistent `@itatti/shared` build script.

## [0.4.2] - 10 April 2026 - Dashboard welcome banner + brand-tinted surfaces

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

## [0.4.1] - 09 April 2026 - "Added By" audit trail + horizontal mapping form

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

## [0.4.0] - 09 April 2026 - Searchable combobox + mapping page redesign

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

## [0.3.0] - 09 April 2026 - Sidebar redesign + Has VIT ID? page

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

## [0.2.0] - 08 April 2026 - Atlassian SCIM sync (Auth0 → Atlassian Cloud)

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

## [0.1.0] - 01 April 2026 - Initial release

### Added
- Initial release: Auth0 login, role-based dashboard, profile page, applications catalog, fellows management, claim VIT ID flow, Jira SM help tickets.
