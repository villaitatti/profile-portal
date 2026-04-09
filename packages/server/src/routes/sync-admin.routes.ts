import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { createSseToken, verifySseToken } from '../lib/sse-token.js';
import { isScimConfigured, getGroups } from '../services/atlassian-scim.service.js';
import {
  runDrySync,
  executeSync,
  storeEmitter,
  getEmitter,
} from '../services/atlassian-sync.service.js';
import type { SyncProgress } from '../services/atlassian-sync.service.js';
import { isDevMode } from '../env.js';

const router = Router();

// ── Mappings CRUD ──────────────────────────────────────────────────

const createMappingSchema = z.object({
  auth0RoleId: z.string().min(1),
  auth0RoleName: z.string().min(1),
  atlassianGroupName: z.string().min(1),
  atlassianGroupId: z.string().nullish(),
});

router.get('/mappings', async (_req, res, next) => {
  try {
    const mappings = await prisma.roleGroupMapping.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json(mappings);
  } catch (err) {
    next(err);
  }
});

router.post('/mappings', async (req, res, next) => {
  try {
    const body = createMappingSchema.parse(req.body);
    const createdBy = (req.auth as Record<string, unknown>)?.email as string || null;
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
  } catch (err) {
    next(err);
  }
});

// ── Groups ────────────────────────────────────────────────────────

router.get('/groups', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const groups = await getGroups();
    res.json(groups.map((g) => ({ id: g.id, displayName: g.displayName })));
  } catch (err) {
    next(err);
  }
});

router.delete('/mappings/:id', async (req, res, next) => {
  try {
    await prisma.roleGroupMapping.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── Sync operations ────────────────────────────────────────────────

router.post('/dry-run', async (req, res, next) => {
  try {
    if (!isDevMode && !isScimConfigured()) {
      res.status(503).json({ error: 'Atlassian SCIM not configured' });
      return;
    }

    const triggeredBy = (req.auth as Record<string, unknown>)?.email as string || req.userId || 'unknown';
    const { runId, emitter } = await runDrySync(triggeredBy);
    storeEmitter(runId, emitter);
    res.status(202).json({ runId });
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown> | null;
    if (errObj && typeof errObj === 'object' && 'status' in errObj && errObj.status === 409) {
      res.status(409).json({
        error: errObj.message ?? 'Sync already running',
        activeRun: errObj.activeRun,
      });
      return;
    }
    next(err);
  }
});

router.post('/execute/:runId', async (req, res, next) => {
  try {
    if (!isDevMode && !isScimConfigured()) {
      res.status(503).json({ error: 'Atlassian SCIM not configured' });
      return;
    }

    const triggeredBy = (req.auth as Record<string, unknown>)?.email as string || req.userId || 'unknown';
    const { runId, emitter } = await executeSync(req.params.runId, triggeredBy);
    storeEmitter(runId, emitter);
    res.status(202).json({ runId });
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown> | null;
    if (errObj && typeof errObj === 'object' && 'status' in errObj) {
      const status = errObj.status as number;
      res.status(status).json({
        error: errObj.message ?? 'Unknown error',
        ...(status === 409 ? { activeRun: errObj.activeRun } : {}),
      });
      return;
    }
    next(err);
  }
});

// ── SSE token issuance ─────────────────────────────────────────────
// Issue a short-lived SSE token (5 min) so the full JWT is never in a query string.
// The SSE stream endpoint below validates this token instead of the JWT.

router.post('/sse-token', (req, res) => {
  const userId = req.userId || 'unknown';
  const token = createSseToken(userId);
  res.json({ token });
});

// ── SSE stream is mounted separately via syncSseRoutes (outside JWT chain) ──

// ── Sync run history ───────────────────────────────────────────────

router.get('/runs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(req.query.perPage) || 20));
    const status = req.query.status as string | undefined;

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
  } catch (err) {
    next(err);
  }
});

router.get('/runs/:id', async (req, res, next) => {
  try {
    const run = await prisma.syncRun.findUnique({ where: { id: req.params.id } });
    if (!run) {
      res.status(404).json({ error: 'Sync run not found' });
      return;
    }
    res.json(run);
  } catch (err) {
    next(err);
  }
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
  if (!isDevMode) {
    if (!sseToken) {
      res.status(401).json({ error: 'Missing sse_token query parameter' });
      return;
    }
    const { valid } = verifySseToken(sseToken);
    if (!valid) {
      res.status(401).json({ error: 'Invalid or expired SSE token' });
      return;
    }
  }

  const { runId } = req.params;

  const run = await prisma.syncRun.findUnique({ where: { id: runId } });
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
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

  const onProgress = (progress: SyncProgress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
    if (progress.phase === 'done' || progress.phase === 'error') {
      cleanup();
    }
  };

  const cleanup = () => {
    emitter.removeListener('progress', onProgress);
    res.end();
  };

  emitter.on('progress', onProgress);
  req.on('close', cleanup);
});

export const syncAdminRoutes = router;
export const syncSseRoutes = sseRouter;
