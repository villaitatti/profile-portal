import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { createSseToken, verifySseToken } from '../lib/sse-token.js';
import { isScimConfigured, getGroups } from '../services/atlassian-scim.service.js';
import { AUTH0_NAMESPACE } from '@itatti/shared';
import {
  runDrySync,
  executeSync,
  storeEmitter,
  getEmitter,
} from '../services/atlassian-sync.service.js';
import type { SyncProgress } from '../services/atlassian-sync.service.js';
import { isDevMode } from '../env.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ── Mappings CRUD ──────────────────────────────────────────────────

const createMappingSchema = z.object({
  auth0RoleId: z.string().min(1),
  auth0RoleName: z.string().min(1),
  atlassianGroupName: z.string().min(1),
  atlassianGroupId: z.string().nullish(),
});

router.get('/mappings', async (_req, res) => {
  const mappings = await prisma.roleGroupMapping.findMany({
    orderBy: { createdAt: 'asc' },
  });
  res.json(mappings);
});

// validate() (not schema.parse in the handler): a bare parse throws ZodError,
// which carries no .status, so the error middleware rendered malformed input
// as a 500 "Internal Server Error" and logged it as an unhandled server error.
router.post('/mappings', validate(createMappingSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createMappingSchema>;
  const auth = req.auth as Record<string, unknown> | undefined;
  const createdBy = (auth?.[`${AUTH0_NAMESPACE}/name`] as string) || (auth?.email as string) || null;
  const mapping = await prisma.roleGroupMapping.create({
    data: {
      auth0RoleId: body.auth0RoleId,
      auth0RoleName: body.auth0RoleName,
      atlassianGroupName: body.atlassianGroupName,
      atlassianGroupId: body.atlassianGroupId || null,
      createdBy,
    },
  });
  res.status(201).json(mapping);
});

// ── Groups ────────────────────────────────────────────────────────

router.get('/groups', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const groups = await getGroups();
  res.json(groups.map((g) => ({ id: g.id, displayName: g.displayName })));
});

router.delete('/mappings/:id', async (req, res, next) => {
  try {
    await prisma.roleGroupMapping.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    // Prisma P2025 = delete target does not exist. A stale admin tab deleting
    // an already-removed mapping is a 404, not a server fault.
    if ((err as { code?: string } | null)?.code === 'P2025') {
      res.status(404).json({ error: 'Mapping not found', code: 'NOT_FOUND' });
      return;
    }
    next(err);
  }
});

// ── Sync operations ────────────────────────────────────────────────

// The sync service throws HttpError (409 SYNC_ALREADY_RUNNING with the active
// run in details, 400/404 dry-run state errors) — the error middleware renders
// them, so these handlers just forward.
router.post('/dry-run', async (req, res) => {
  if (!isDevMode && !isScimConfigured()) {
    res.status(503).json({ error: 'Atlassian SCIM not configured', code: 'SCIM_NOT_CONFIGURED' });
    return;
  }

  const auth = req.auth as Record<string, unknown> | undefined;
  const triggeredBy = (auth?.[`${AUTH0_NAMESPACE}/name`] as string) || (auth?.email as string) || req.userId || 'unknown';
  const { runId, emitter } = await runDrySync(triggeredBy);
  storeEmitter(runId, emitter);
  res.status(202).json({ runId });
});

router.post('/execute/:runId', async (req, res) => {
  if (!isDevMode && !isScimConfigured()) {
    res.status(503).json({ error: 'Atlassian SCIM not configured', code: 'SCIM_NOT_CONFIGURED' });
    return;
  }

  const auth = req.auth as Record<string, unknown> | undefined;
  const triggeredBy = (auth?.[`${AUTH0_NAMESPACE}/name`] as string) || (auth?.email as string) || req.userId || 'unknown';
  const { runId, emitter } = await executeSync(req.params.runId, triggeredBy);
  storeEmitter(runId, emitter);
  res.status(202).json({ runId });
});

// ── SSE token issuance ─────────────────────────────────────────────
// Issue a short-lived SSE token (5 min) so the full JWT is never in a query
// string. The token is BOUND to one run id: the stream endpoint refuses a
// token minted for a different run, so a leaked token cannot be replayed to
// watch other syncs.

const sseTokenSchema = z.object({ runId: z.string().min(1).max(200) });

router.post('/sse-token', validate(sseTokenSchema), (req, res) => {
  const userId = req.userId || 'unknown';
  const { runId } = req.body as z.infer<typeof sseTokenSchema>;
  const token = createSseToken(userId, runId);
  res.json({ token });
});

// ── SSE stream is mounted separately via syncSseRoutes (outside JWT chain) ──

// ── Sync run history ───────────────────────────────────────────────

const runsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20).catch(20),
  // status is a DB enum now; an unknown value falls back to "no filter"
  // (matching the old forgiving behavior) instead of a Prisma 500.
  status: z.enum(['dry_run', 'executing', 'completed', 'failed', 'partial']).optional().catch(undefined),
});

router.get('/runs', async (req, res) => {
  // .catch() preserves the old forgiving behavior (garbage → default) rather
  // than turning a malformed pagination param into a 400.
  const { page, perPage, status } = runsQuerySchema.parse(req.query);
  const where = status ? { status } : {};
  const [runs, total] = await Promise.all([
    prisma.syncRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        status: true,
        triggeredBy: true,
        dryRunId: true,
        startedAt: true,
        completedAt: true,
        stats: true,
      },
    }),
    prisma.syncRun.count({ where }),
  ]);

  res.json({ runs, total, page, perPage });
});

router.get('/runs/:id', async (req, res) => {
  const run = await prisma.syncRun.findUnique({ where: { id: req.params.id } });
  if (!run) {
    res.status(404).json({ error: 'Sync run not found', code: 'NOT_FOUND' });
    return;
  }
  res.json(run);
});

// ── Configuration status ───────────────────────────────────────────

router.get('/status', (_req, res) => {
  res.json({
    configured: isDevMode || isScimConfigured(),
    devMode: isDevMode,
  });
});

// SSE stream route — mounted OUTSIDE the JWT middleware chain in index.ts.
// Auth is handled by the short-lived SSE token validated inline.
const sseRouter = Router();

sseRouter.get('/runs/:runId/stream', async (req, res) => {
  const sseToken = req.query.sse_token as string | undefined;
  const { runId } = req.params;
  if (!isDevMode) {
    if (!sseToken) {
      res.status(401).json({ error: 'Missing sse_token query parameter', code: 'UNAUTHORIZED' });
      return;
    }
    const verified = verifySseToken(sseToken);
    if (!verified.valid) {
      res.status(401).json({ error: 'Invalid or expired SSE token', code: 'UNAUTHORIZED' });
      return;
    }
    // Run binding: a token minted for one run must not open another run's
    // stream. Same 401 body as an invalid token — no oracle about which
    // run ids exist.
    if (verified.runId !== runId) {
      res.status(401).json({ error: 'Invalid or expired SSE token', code: 'UNAUTHORIZED' });
      return;
    }
  }

  const run = await prisma.syncRun.findUnique({ where: { id: runId } });
  if (!run) {
    res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
    return;
  }

  if (['completed', 'failed', 'partial'].includes(run.status)) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(`data: ${JSON.stringify({ phase: 'done', step: 1, totalSteps: 1, percentage: 100, description: `Run ${run.status}`, status: run.status })}\n\n`);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emitter = getEmitter(runId);
  if (!emitter) {
    res.write(`data: ${JSON.stringify({ phase: 'error', description: 'No active sync for this run' })}\n\n`);
    res.end();
    return;
  }

  const flushIfBuffered = () => {
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
  };

  const onProgress = (progress: SyncProgress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
    flushIfBuffered();
    if (progress.phase === 'done' || progress.phase === 'error') {
      cleanup();
    }
  };

  // Keep-alive comment. The Auth0 fetch phase emits only one event per mapped
  // role, so a large role list (worse when it hits 429 backoffs) can exceed
  // cloudflared's idle timeout and drop the stream while the run is still
  // progressing server-side. A comment line is ignored by EventSource and
  // resets the idle timer on every intermediate proxy.
  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
    flushIfBuffered();
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    emitter.removeListener('progress', onProgress);
    res.end();
  };

  emitter.on('progress', onProgress);
  req.on('close', cleanup);
});

export const syncAdminRoutes = router;
export const syncSseRoutes = sseRouter;
