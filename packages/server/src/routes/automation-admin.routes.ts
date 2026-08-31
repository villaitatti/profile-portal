import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import * as automationService from '../services/automation.service.js';
import { AUTH0_NAMESPACE } from '@itatti/shared';

const router = Router();

function getTriggeredBy(req: Request, res: Response): string | null {
  const auth = req.auth as Record<string, unknown> | undefined;
  const identity =
    (auth?.[`${AUTH0_NAMESPACE}/email`] as string | undefined) ||
    (auth?.email as string | undefined) ||
    req.userId;
  if (!identity) {
    res.status(401).json({ error: 'Could not identify admin user', code: 'UNAUTHORIZED' });
    return null;
  }
  return `admin:${identity}`;
}

// Async rejections forward to the error middleware natively (Express 5);
// handlers here have no error mapping of their own, so no try/catch.

// List automation run history
router.get('/runs', async (_req, res) => {
  const runs = await prisma.automationRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
  });
  res.json(runs);
});

// Get specific automation run
router.get('/runs/:id', async (req, res) => {
  const run = await prisma.automationRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
  res.json(run);
});

// Dry run endpoints
router.post('/end-of-year/dry-run', async (req, res) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  res.json(await automationService.runEndOfYearDryRun(triggeredBy));
});

router.post('/new-cohort/dry-run', async (req, res) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  res.json(await automationService.runNewCohortDryRun(triggeredBy));
});

router.post('/backfill/dry-run', async (req, res) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  res.json(await automationService.runBackfillDryRun(triggeredBy));
});

// Execute endpoints
router.post('/end-of-year/execute/:runId', async (req, res) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  res.json(
    await automationService.executeAutomation(req.params.runId, triggeredBy, 'end-of-year-cleanup')
  );
});

router.post('/new-cohort/execute/:runId', async (req, res) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  res.json(
    await automationService.executeAutomation(req.params.runId, triggeredBy, 'new-cohort-onboarding')
  );
});

router.post('/backfill/execute/:runId', async (req, res) => {
  const triggeredBy = getTriggeredBy(req, res);
  if (!triggeredBy) return;
  res.json(await automationService.executeAutomation(req.params.runId, triggeredBy, 'backfill'));
});

export { router as automationAdminRoutes };
