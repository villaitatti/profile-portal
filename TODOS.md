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
