# TODOS

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
