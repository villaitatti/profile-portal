# TODOS

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

### Migrate to server-side search when user count exceeds ~500
- **What:** Switch from client-side filter to paginated API with search query parameter
- **Why:** At 70-80 new users/year, client-side filtering of the full user list will feel slow in 3-4 years (~500+ users, ~1MB+ payload)
- **How:** Auth0 Management API supports `q` parameter for user search. Add search query param to `GET /api/admin/users` and pass through to `management.users.getAll({ q: ... })`
- **Context:** Currently ~240 users, client-side filter is instant. Monitor payload size.

## Atlassian Cloud — Future Improvements

### Auto-detect unmapped Auth0 roles on Mappings page
- **What:** Compare Auth0 roles against existing group mappings, show banner for unmapped roles
- **Why:** If a new role is created in Auth0 but not mapped, the sync silently ignores users with that role
- **How:** `useRoles()` already fetches all Auth0 roles. Compare against `useMappings()` result. Show info banner: "You have 2 unmapped roles: [role1, role2]. Map them?"
- **Context:** Currently roles are managed manually. This would catch configuration drift.
