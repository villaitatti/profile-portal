# TODOS

## Forms — Follow-ups from ship adversarial review (2026-05-07)

### Paginate /api/admin/forms/invitations when archive grows
- **Priority:** P2
- **What:** Add cursor-based pagination + server-side search/filter to the submissions archive endpoint. Today the endpoint returns every submitted invitation unbounded and filters client-side.
- **Why:** Current volume (~100s of submissions/year) fits comfortably, but at 500+ submissions per cohort the full list becomes slow to render and annoying to scroll.
- **How:** (a) Add `cursor` + `limit` query params, mirror the pattern in `emails-admin.routes.ts`. (b) Add `q` param for server-side substring match on contactName/formTitle. (c) Push the academicYear + formType filters into the query where-clause (they're already server-supported, just not used by the archive page yet).
- **Context:** Flagged by Codex during `/ship` of the initial submissions archive. The response-JSON-loading half of this TODO was fixed in the same review round (`listInvitations` now projects only `response.id` for a boolean `hasResponse` signal). What remains is unbounded list size.
- **Blocked by:** Nothing.

### Stampede protection + timeout on CiviCRM name lookup
- **Priority:** P3
- **What:** The fellows cache in `forms-admin.routes.ts` (and `emails-admin.routes.ts`) has no in-flight request coalescing. On cache expiry, concurrent admin opens all call `civicrmService.getFellowsWithContacts()` in parallel. If CiviCRM hangs, every concurrent archive open hangs too.
- **Why:** Low impact today (few concurrent admin users), but admin experience degrades hard if CiviCRM slows down.
- **How:** Add a `pendingFellowsPromise` alongside `cachedFellows` — first caller populates, others await the same promise. Add a 5s timeout on the CiviCRM call; on timeout, fall through to graceful degrade (empty name map) just like the existing try/catch.
- **Context:** Flagged by Codex during `/ship` of the submissions archive. The existing try/catch handles "CiviCRM throws" but not "CiviCRM hangs forever." Applies equally to `emails-admin.routes.ts` which uses the same pattern.
- **Blocked by:** Nothing. Ideal candidate for the existing shared-cache refactor (both routes use identical code).

### Strict calendar validation on submitted date fields (submit-time)
- **Priority:** P3
- **What:** `buildFormSchema` in `packages/server/src/lib/form-schema.ts` treats `type: 'date'` form fields as generic strings. A public form submit can therefore persist an impossible calendar date like `"2026-02-31"`. The display side is already defensive (`formatDateOnly` rejects impossible dates and returns the raw string unchanged), so the archive shows `"2026-02-31"` literally instead of a rolled-over `"3 Mar 2026"`. But the bad data still lives in the DB and the PDF, and no one gets an error at submit time.
- **Why:** Low-impact today because appointees use HTML `<input type="date">` pickers (which validate client-side). The gap opens via a raw POST, a misbehaving client, or a form library migration.
- **How:** In `buildFormSchema`, for `type === 'date'` fields add a `z.string().refine(...)` that splits `YYYY-MM-DD` and verifies the calendar via a Date round-trip (same pattern as `formatDateOnly` in `form-pdf.service.ts` and `form-render.ts`). Consider extracting the round-trip into a shared helper in `@itatti/shared` so submit validation and display formatting share the same predicate.
- **Context:** Flagged by Codex during `/ship` of the submissions archive. Display-side fix landed in the same PR; submit-side validation is the remaining gap.
- **Blocked by:** Nothing.

### Worker unit-test infrastructure (pg-boss queues)
- **Priority:** P3
- **What:** The project has zero tests for any of the `packages/server/src/workers/*` files. That's how the pg-boss v10 `createQueue` regression (fixed in this PR) lived undetected for a full release cycle — a future refactor could silently remove the fix with no CI signal.
- **Why:** Any code that touches the job queue has the same silent-failure shape: `boss.send()` returns null on misconfigured queues, no error is thrown, downstream side effects (emails, reports) never fire. Unit tests would have caught the original bug at PR time.
- **How:** Either (a) add a lightweight mocking layer where tests import a `bossStub` that replaces the real `getJobQueue()` via `vi.mock`, assert `createQueue` is called before `work`, and assert `enqueueFormNotification` logs when `send` returns null — OR (b) add a docker-compose test fixture with a disposable Postgres instance and run pg-boss against it in CI. Option (a) is cheap and catches the specific regression; option (b) catches more integration issues but adds CI time. Start with (a).
- **Context:** Flagged during `/ship` of the form-submit-fix branch. The reviewer noted the createQueue fix has no regression test.
- **Blocked by:** Nothing.

## Forms — Bugs to investigate

### Public form submit yields "already submitted" + no notification email
- **What:** When an appointee opens a fresh nomination link, fills the form, and submits, the UI shows "Form Already Submitted" and neither the appointee nor Angela receives the notification email.
- **Why:** The whole appointee-forms workflow is broken end-to-end. Angela relies on the notification email (with PDF attachment) as the record of submission. If emails aren't sending, the submissions archive feature (see `acaselli-main-forms-submissions-design-20260507-121453.md`) has far less value because it can't be validated against the email record, and the current status-quo archive (Angela's email inbox) doesn't exist.
- **How:** Route to `/investigate`. Likely suspects:
  1. `packages/server/src/services/form-invitation.service.ts#submitForm` — check if the status transition to `submitted` runs correctly and only once.
  2. `packages/server/src/workers/form-notification.worker.ts` — check if `enqueueFormNotification` is firing and the worker is actually running in dev.
  3. `packages/web/src/pages/forms/PublicFormPage.tsx:31` — the "already submitted" check renders when `data.status === 'submitted'`; double-check whether stale query cache or a submit-then-refetch race triggers it incorrectly.
  4. Email transport (SMTP config, `FORM_NOTIFICATION_EMAIL` env). The v0.13 commits touched `FORM_NOTIFICATION_*` envs — regression possibility.
- **Context:** Flagged by Andrea during the 2026-05-07 `/plan-eng-review` of the submissions archive feature. The submissions archive PR does NOT touch this code and can ship independently, but this bug should be prioritized because the workflow is currently broken.
- **Blocked by:** Nothing — this is a standalone investigation.

## Contact Info Self-Service — Prerequisites

### Upgrade CiviCRM API key to read-write (BLOCKER)
- **What:** Change the CiviCRM API user's permissions from read-only to read-write (or grant write access to Address and Phone entities).
- **Why:** The contact info self-service feature requires Address.create, Address.update, Address.delete, Phone.create, Phone.update, Phone.delete. Current key is read-only.
- **How:** CiviCRM admin panel → API users/permissions. Grant write access to Address and Phone entities at minimum.
- **Context:** Key lives in .env as CIVICRM_API_KEY. Must be done before integration testing. Server-side only, never exposed to frontend.
- **Blocked by:** Nothing. This is a prerequisite for the feature.

## Contact Info Self-Service — Future Enhancements

### JSM email change request form
- **What:** Replace the "Contact IT staff" mailto link on the profile email section with a link to a Jira Service Management request form for email changes.
- **Why:** A JSM form creates a trackable ticket, assigns it to the right person, gives the Fellow visibility into request status.
- **How:** Create a JSM request type for "Email change request." Link from the profile page to the JSM portal URL (pre-filled with the Fellow's current email as context). JIRA_* env vars already exist in env.ts.
- **Context:** The help form pattern already exists (helpRoutes). Initial implementation ships with a mailto link. This captures the upgrade path.
- **Depends on:** Contact info self-service feature landing first.

## ~~Email Log — Follow-ups from /ship adversarial review~~ (RESOLVED)

### ~~Add pagination or date-bounded query to email events list endpoint~~ (RESOLVED)
- **Resolved:** Cursor-based pagination with `take: limit + 1` and server-side filtering by year/type/status implemented in `emails-admin.routes.ts`. Frontend uses "Load more" button.

### ~~Cache CiviCRM fellows roster in email list endpoint~~ (RESOLVED)
- **Resolved:** 120s in-memory TTL cache (`cachedFellows` + `cachedFellowsExpires`) implemented in `emails-admin.routes.ts`.

## Atlassian Sync — Pre-Implementation Checks

### Verify SSE through cloudflared
- **What:** Test that Server-Sent Events (SSE) work correctly through the cloudflared tunnel
- **Why:** Cloudflare proxies can buffer streaming responses, breaking real-time progress UI
- **How:** Set `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform` headers on SSE endpoint. Deploy and verify events arrive in real-time, not batched.
- **Context:** App deployed via Docker + cloudflared. SSE endpoint at `GET /api/admin/sync/runs/:runId/stream`
- **Blocked by:** Atlassian sync feature implementation

### ~~Verify Prisma migration strategy~~ (RESOLVED)
- **Resolved:** Project uses `prisma migrate dev`. Migration `20260407150519_add_sync_tables` has been created and applied successfully.

## Has VIT ID? — Future Improvements

### ~~Migrate to server-side search when user count exceeds ~500~~ (SUPERSEDED)
- **Resolved:** The VIT ID match ladder PR (feat/vit-id-match-ladder) unifies the Has VIT ID page onto a single server-side search endpoint. Client-side filter retired.

## VIT ID Match Ladder — Follow-ups

### Approach C: Periodic reconciliation job (writes civicrm_id to Auth0)
- **What:** Nightly or on-demand job that walks all Auth0 users in the fellows role, looks up their canonical civicrm_id via the match ladder, writes it to `app_metadata.civicrm_id` if missing or different.
- **Why:** The match ladder currently catches each case at read time. A reconciliation job makes civicrm_id lookup O(1) going forward and cleans up historical drift in one shot.
- **Pros:** Fewer "active-different-email" rows over time (they become plain "active" after reconciliation). Simplifies the dashboard. Audit log of every write creates a paper trail.
- **Cons:** Writes to Auth0 app_metadata. Needs idempotency, dry-run mode, audit log, and a way to pause/resume. Out of scope for the current read-path fix.
- **Context:** The observability log in the dashboard (`byMatchedVia` + `byNeedsReviewReason`) will tell you how often this is firing. If "name" or "secondary-email" matchedVia counts stay high after 2-3 months, build this. If they trend to zero (because claim flow now handles new cases correctly), skip.
- **Depends on:** feat/vit-id-match-ladder landing first (for the reconciliation logic to reuse).

### dispatchPendingEmails: cache Auth0 maps per dispatch run
- **What:** `evaluateBioEmailEligibility` calls `checkHasVitIdViaLadder`, which calls `listUsersByRole` once per PENDING event. For N events per cron tick, this is N full Auth0 list fetches.
- **Why:** At current scale (a few bio emails per dispatch) the cost is negligible. If dispatch volume grows, this becomes an N+1 pattern inside the cron and can burn Auth0 Management API quota or add real latency.
- **How:** Pre-build the Auth0 maps once at the top of `dispatchPendingEmails`, pass them down to `dispatchOne` and into `evaluateBioEmailEligibility` (optional param — falls back to fresh fetch if not supplied, so single-shot callers like `sendBioEmailManually` keep working). Short in-memory TTL (60s) is an acceptable alternative.
- **Pros:** Makes the cron O(1) on Auth0 list fetches. Matches the dashboard pattern.
- **Cons:** Adds an optional param that ripples through 2-3 functions. Ergonomic cost.
- **Context:** Caught by /ship pre-landing review on feat/vit-id-match-ladder (PR #12). Flagged as P2 — ship as-is and revisit if dispatch volume grows.
- **Depends on:** Nothing.

### Dashboard staleTime + manual refresh button
- **What:** Set `staleTime: 60_000` on `useFellowsDashboard` React Query + add a "Refresh" button in the dashboard header to force a refetch.
- **Why:** Currently the dashboard refetches on every mount, causing a 1-2s CiviCRM+Auth0 round-trip on every navigation. With the new Email.get call added by the match ladder, this is slightly heavier.
- **Pros:** Faster navigation. Manual refresh covers the "I'm in a hurry and just changed something in CiviCRM" case.
- **Cons:** Stale-until-refresh UX unless users know about the button.
- **Context:** Angela and Andrea both navigate in and out of the dashboard during a fellowship onboarding session.
- **Depends on:** Nothing. Standalone.

## Atlassian Cloud — Future Improvements

### Auto-detect unmapped Auth0 roles on Mappings page
- **What:** Compare Auth0 roles against existing group mappings, show banner for unmapped roles
- **Why:** If a new role is created in Auth0 but not mapped, the sync silently ignores users with that role
- **How:** `useRoles()` already fetches all Auth0 roles. Compare against `useMappings()` result. Show info banner: "You have 2 unmapped roles: [role1, role2]. Map them?"
- **Context:** Currently roles are managed manually. This would catch configuration drift.

## Profile Portal Visual Consistency

### VIT ID claim page visual review
- **What:** Audit the VIT ID claim page (the page the appointee lands on after clicking the CTA in the invitation email) and bring it in line with the I Tatti institutional brand established by the email templates.
- **Why:** The appointee's FIRST interactive impression of the portal is this page, reached directly from an email that looks like formal correspondence from a Harvard research center. If the claim page looks like a generic form UI, the brand continuity breaks at the most load-bearing moment.
- **Pros:** Maintains the institutional-correspondence tone end-to-end. Compounds with the email design investment rather than undoing it at the first click.
- **Cons:** Separate PR; requires a pass on the claim page's current state, then a coherent design-system application.
- **Context:** Design decisions for the email templates were locked in plan-design-review on 2026-04-22. The email uses: I Tatti logo header on warm-grey institutional background, Georgia serif body, squared crimson CTA (`#ab192d`, 4px radius), muted-grey footer with physical address. The claim page should echo at least the header (logo + wordmark) and the primary-action treatment (CTA button style). See `~/.gstack/projects/villaitatti-profile-portal/acaselli-main-design-20260422-172624.md` "Email HTML System" section for tokens.
- **Depends on:** The Manage Appointees + HTML email PR landing first (establishes the tokens).

## Appointee Email Pipeline — Follow-ups from /ship review

### Harmonize bio-email route error surface with VIT invitation (503 for civicrm_unavailable)
- **What:** `POST /api/admin/fellows/:contactId/send-bio-email` currently wraps upstream CiviCRM failures as a 500 `internal_error`. The new `/send-vit-id-email` returns 503 `{reason: "civicrm_unavailable"}` for the same transient failure mode so the modal can surface "CiviCRM is temporarily unavailable. Try again." The UIs therefore interpret identical server state differently.
- **Why:** Angela will hit this drift the first time CiviCRM has a blip during a manual bio send — she'll get a generic server error instead of the actionable retry message.
- **How:** Wrap `evaluateBioEmailEligibility` / `sendBioEmailManually` the same way the VIT route does: catch CiviCRM errors, return `{eligible: false, reason: 'civicrm_unavailable'}`, and emit 503 from the route. Factor the envelope helper so both paths share it.
- **Context:** Flagged by /ship pre-landing review on feat/manage-appointees-html-email 2026-04-23. Priority: P2 — cosmetic UX drift, no correctness bug.
- **Depends on:** Manage Appointees PR landing.

### Close the delete+create race in manual-send retry paths
- **What:** `sendBioEmailManually` and `sendVitIdInvitationManually` handle a FAILED/SKIPPED row by `prisma.appointeeEmailEvent.delete` → `enqueueAppointeeEmail`. Between the two statements a concurrent worker (cron, a second admin click) could insert its own row; the enqueue then returns `created: false` and the outer caller's eventId corresponds to a send it didn't trigger. The unique index prevents duplicates; the race surfaces as a misleading toast.
- **Why:** Rare in practice (one admin, one click at a time), but the window is real and flagging in a log.
- **How:** Wrap the delete + enqueue in a single `prisma.$transaction([…])`, or replace with `upsert` on `(fellowshipId, emailType)` that resets status to PENDING.
- **Context:** Flagged by /ship pre-landing review on feat/manage-appointees-html-email 2026-04-23. Priority: P3 — rare race, no data integrity impact.
- **Depends on:** Nothing.

## Appointee Forms — Follow-ups

### Add file upload field type (v1.1)
- **What:** Add file upload field type (photo, CV, grant letter) to the form system.
- **Why:** Google Form 2 mentions "send us by email attachment, a copy of the grant letter" — currently punted to email. File uploads would complete the form workflow.
- **Pros:** Angela gets everything in one place. No separate email attachments needed.
- **Cons:** Requires S3 bucket setup, multipart upload handling, virus scanning, PDF inclusion of file links.
- **Context:** Explicitly scoped out of v1. Revisit after the core form system is working and Angela confirms she actually wants this in the portal vs. continuing to accept attachments by email.
- **Depends on:** Core appointee forms feature landing.

### Add forms for other appointment types
- **What:** Define FormDef entries for non-Fellow appointment types (short-term, visiting scholars, etc.).
- **Why:** Angela has different forms for different fellowship types. Only Fellow is implemented in v1.
- **Pros:** Completes the migration off Google Forms for all appointment types.
- **Cons:** Need to collect form specs from Angela for each type. May require new field types.
- **Context:** Architecture supports this — add new entries to FORM_REGISTRY with different appointmentTypes arrays. Blocked on Angela providing the other form templates.
- **Depends on:** Core appointee forms feature landing + Angela's form specs for other types.
