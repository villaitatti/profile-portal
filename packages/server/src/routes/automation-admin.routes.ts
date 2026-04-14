import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import * as automationService from '../services/automation.service.js';

const router = Router();

function getTriggeredBy(req: Request, res: Response): string | null {
  const email = (req as any).user?.email || (req as any).user?.sub;
  if (!email) {
    res.status(401).json({ error: 'Could not identify admin user' });
    return null;
  }
  return `admin:${email}`;
}

// List automation run history
router.get('/runs', async (_req, res, next) => {
  try {
    const runs = await prisma.automationRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

// Get specific automation run
router.get('/runs/:id', async (req, res, next) => {
  try {
    const run = await prisma.automationRun.findUnique({ where: { id: req.params.id } });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// Dry run endpoints
router.post('/end-of-year/dry-run', async (req, res, next) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  try {
    const result = await automationService.runEndOfYearDryRun(triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/new-cohort/dry-run', async (req, res, next) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  try {
    const result = await automationService.runNewCohortDryRun(triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/backfill/dry-run', async (req, res, next) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  try {
    const result = await automationService.runBackfillDryRun(triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Execute endpoints
router.post('/end-of-year/execute/:runId', async (req, res, next) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  try {
    const result = await automationService.executeAutomation(req.params.runId, triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/new-cohort/execute/:runId', async (req, res, next) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  try {
    const result = await automationService.executeAutomation(req.params.runId, triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/backfill/execute/:runId', async (req, res, next) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  try {
    const result = await automationService.executeAutomation(req.params.runId, triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as automationAdminRoutes };
