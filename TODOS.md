# TODOS

## Atlassian Sync — Pre-Implementation Checks

### Verify SSE through cloudflared
- **What:** Test that Server-Sent Events (SSE) work correctly through the cloudflared tunnel
- **Why:** Cloudflare proxies can buffer streaming responses, breaking real-time progress UI
- **How:** Set `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform` headers on SSE endpoint. Deploy and verify events arrive in real-time, not batched.
- **Context:** App deployed via Docker + cloudflared. SSE endpoint at `GET /api/admin/sync/runs/:runId/stream`
- **Blocked by:** Atlassian sync feature implementation

### Verify Prisma migration strategy
- **What:** Confirm whether the project uses `prisma migrate dev` (migration files) or `prisma db push` (direct schema push) for schema changes
- **Why:** Adding SyncRun + RoleGroupMapping tables doubles the schema surface. Need to know the deployment workflow before writing the migration.
- **How:** Check if `packages/server/prisma/migrations/` directory exists. Check Dockerfile and docker-compose for Prisma commands.
- **Context:** Current schema has 1 model (Application). No migrations directory visible in repo.
- **Blocked by:** Nothing — can verify immediately
