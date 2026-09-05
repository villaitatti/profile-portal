# TODOS

## Forms — Follow-ups from ship adversarial review (2026-05-07)

### Paginate /api/admin/forms/invitations when archive grows
- **Priority:** P3 (downgraded from P2 on 03 September 2026: the endpoint now caps the response at `INVITATION_LIST_MAX = 1000` rows with a visible `truncated` flag, so the unbounded-growth risk is gone; what remains is the UX of cursor pagination + server-side search once a cohort actually hits the cap)
- **What:** Add cursor-based pagination + server-side search/filter to the submissions archive endpoint. Today the endpoint returns every submitted invitation unbounded and filters client-side.
- **Why:** Current volume (~100s of submissions/year) fits comfortably, but at 500+ submissions per cohort the full list becomes slow to render and annoying to scroll.
- **How:** (a) Add `cursor` + `limit` query params, mirror the pattern in `emails-admin.routes.ts`. (b) Add `q` param for server-side substring match on contactName/formTitle. (c) Push the academicYear + formType filters into the query where-clause (they're already server-supported, just not used by the archive page yet).
- **Context:** Flagged by Codex during `/ship` of the initial submissions archive. The response-JSON-loading half of this TODO was fixed in the same review round (`listInvitations` now projects only `response.id` for a boolean `hasResponse` signal). What remains is unbounded list size.
- **Blocked by:** Nothing.

### Migrate off react-router-dom and onto react-router v8
- **Priority:** P2
- **What:** `packages/web` imports from `react-router-dom` in 28 files. `react-router-dom` has no v8 release (it was folded into `react-router`), and GHSA-qwww-vcr4-c8h2 is only patched in `react-router` >= 8.3.0. Migrate the imports, bump to v8, drop `react-router-dom`, and remove the `auditConfig.ignoreGhsas` entry from `pnpm-workspace.yaml`.
- **Why:** Right now the advisory is suppressed with a documented exception rather than fixed. The suppression is sound — the vulnerability is an RSC-mode server-action CSRF bypass and this is a pure client SPA with no RSC, no SSR entry, no route loaders/actions, and a bearer-token API with no cookies — but a suppression is a standing claim that has to be re-verified every time the routing setup changes.
- **How:** The API surface in use is small and unchanged in v8: `createBrowserRouter`, `RouterProvider`, `Routes`, `Route`, `Link`, `NavLink`, `Navigate`, `Outlet`, `MemoryRouter`, `useLocation`, `useNavigate`, `useParams`, `useSearchParams`. Step 1 (swap `react-router-dom` → `react-router`) is valid on v7 too, so it can land and be verified on its own before the major bump.
- **Context:** Deliberately deferred during the v0.17.15 production-readiness pass — a major routing bump on launch week costs more risk than the suppressed advisory does. The exception in `pnpm-workspace.yaml` carries the full rationale.
- **Blocked by:** Nothing.

### Drop the deepmerge-ts audit suppression once Prisma updates its pin
- **Priority:** P3
- **What:** GHSA-ggr8-5vv4-36mx (deepmerge-ts <8.0.0) is suppressed in `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas`. It reaches us only as a transitive dependency of the Prisma CLI (`@prisma/config`), which pins `deepmerge-ts@7.1.5`. Remove the suppression when a Prisma release bumps that pin to the patched 8.x.
- **Why:** The suppression is sound today — deepmerge-ts runs only during `prisma generate` / `prisma migrate deploy`, its input is our own committed config (never user data), and force-overriding a Prisma-internal dependency to a new major risks breaking migrations at container start. But like any suppression it is a standing claim to re-check.
- **How:** Periodically `pnpm why deepmerge-ts` after Prisma upgrades; once it resolves to >=8.0.0, delete the `GHSA-ggr8-5vv4-36mx` entry and confirm `pnpm audit --prod` stays green.
- **Context:** This advisory surfaced spontaneously mid-review (the advisory DB updates continuously) and was blocking the CI `pnpm audit` gate. Exactly the "new upstream advisory blocks deploys" dynamic flagged as L8 in the original readiness review.
- **Blocked by:** A Prisma release that bumps the pin.

### ~~Bind SSE tokens to a specific sync run~~ (RESOLVED)
- **Resolved:** v0.20.0. `lib/sse-token.ts` signs `runId` into the token payload and `sync-admin.routes.ts` rejects a run-id mismatch on connect with the same 401 body as an invalid token (no run-id oracle). Verified during the 03 September 2026 production-readiness review.

### ~~Stampede protection + timeout on CiviCRM name lookup~~ (RESOLVED)
- **Resolved:** verified during the 03 September 2026 production-readiness review. The shared `services/fellows-cache.service.ts` implements in-flight coalescing, a 30s overall deadline, and an empty-roster no-cache guard; both `forms-admin.routes.ts` and `emails-admin.routes.ts` use it (the shared-cache refactor this entry hoped for).

### ~~Worker unit-test infrastructure (pg-boss queues)~~ (RESOLVED)
- **Resolved:** v0.17.15 (31 July 2026). This entry was already partly stale — `packages/server/src/__tests__/workers/form-notification.worker.test.ts` existed and covered the happy path (PDF generation + email dispatch) via the option (a) `vi.mock` approach. Added the two silent-failure cases the entry was actually worried about: `enqueueFormNotification` logging an ERROR when `boss.send()` returns null (the createQueue regression shape), and a handler failure being logged before it is rethrown. The handler previously swallowed its own failure into pg-boss with no application log, so a deterministic failure exhausted its retries and vanished.
- **Not done:** option (b), a disposable-Postgres integration fixture in CI. Still worth considering if the queue grows beyond one worker.

## ~~Forms — Bugs to investigate~~ (RESOLVED)

### ~~Public form submit yields "already submitted" + no notification email~~ (RESOLVED)
- **Resolved:** v0.14.1.0 (2026-05-07). Two root causes:
  1. `PublicFormPage.tsx` was short-circuiting to "Form Already Submitted" after a successful submit (race between `useSubmitForm.onSuccess`'s `invalidateQueries` refetch and `PublicFormRenderer`'s `isSuccess` screen). Fixed with a token-keyed `useRef` snapshot of initial status.
  2. `pg-boss` v10 requires `boss.createQueue(name)` before `boss.send()` will insert anything — missing queue makes send silently return null. No queue was ever created, so every form submission since v0.13.0 dropped its notification email. Fixed by moving queue creation into `getJobQueue()` (runs for every declared queue at boot) + awaiting worker registration before `app.listen()` + loud ERROR log on any null send result.

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

### ~~dispatchPendingEmails: cache Auth0 maps per dispatch run~~ (RESOLVED)
- **Resolved:** verified during the 03 September 2026 production-readiness review. `dispatchPendingEmails` prefetches `buildLadderContext()` once per run and passes it down, exactly the shape this entry proposed; single-shot callers still fetch fresh.

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

### ~~Harmonize bio-email route error surface with VIT invitation (503 for civicrm_unavailable)~~ (RESOLVED)
- **Resolved:** verified during the 03 September 2026 production-readiness review. `send-bio-email` now returns 503 `civicrm_unavailable` / 502 `email_send_failed` identically to the VIT route.

### ~~Close the delete+create race in manual-send retry paths~~ (OBSOLETE)
- **Obsolete:** verified during the 03 September 2026 production-readiness review. The delete+create pattern no longer exists — `manualSendCore` enqueues with `allowHistoricalDuplicate` under the partial unique index, so there is no window to close.

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
- **Why:** Angela has different forms for different fellowship types. Full year Fellows and the first short-term Fellow variants are implemented; other appointment families still need templates.
- **Pros:** Completes the migration off Google Forms for all appointment types.
- **Cons:** Need to collect form specs from Angela for each type. May require new field types.
- **Context:** Architecture supports this — add new entries to FORM_REGISTRY with appointment and, where needed, raw CiviCRM fellowship-type matching. Standard Term Fellow, Dumbarton Oaks, and Graduate Fellow forms are now covered; visiting scholars and other remaining appointment families still need Angela's form specs.
- **Depends on:** Core appointee forms feature landing + Angela's form specs for other types.

## Completed

### Strict calendar validation on submitted date fields (submit-time)
- **Priority:** P3
- **What:** `buildFormSchema` now rejects impossible calendar dates such as `"2026-02-31"` before public form data is stored.
- **Why:** Raw API clients and future form implementations can no longer bypass the browser date picker's calendar validation and persist invalid dates into submissions and PDFs.
- **Context:** Completed as part of the production-readiness hardening pass, with regression coverage for leap days, impossible dates, and malformed values.
- **Blocked by:** Nothing.

**Completed:** v0.17.13 (15 July 2026)
