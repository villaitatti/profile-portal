import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import * as automationService from '../services/automation.service.js';

const router = Router();

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
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// Dry run endpoints
router.post('/end-of-year/dry-run', async (req, res) => {
  const triggeredBy = `admin:${(req as any).user?.email || 'unknown'}`;
  const result = await automationService.runEndOfYearDryRun(triggeredBy);
  res.json(result);
});

router.post('/new-cohort/dry-run', async (req, res) => {
  const triggeredBy = `admin:${(req as any).user?.email || 'unknown'}`;
  const result = await automationService.runNewCohortDryRun(triggeredBy);
  res.json(result);
});

router.post('/backfill/dry-run', async (req, res) => {
  const triggeredBy = `admin:${(req as any).user?.email || 'unknown'}`;
  const result = await automationService.runBackfillDryRun(triggeredBy);
  res.json(result);
});

// Execute endpoints
router.post('/end-of-year/execute/:runId', async (req, res) => {
  const triggeredBy = `admin:${(req as any).user?.email || 'unknown'}`;
  const result = await automationService.executeAutomation(req.params.runId, triggeredBy);
  res.json(result);
});

router.post('/new-cohort/execute/:runId', async (req, res) => {
  const triggeredBy = `admin:${(req as any).user?.email || 'unknown'}`;
  const result = await automationService.executeAutomation(req.params.runId, triggeredBy);
  res.json(result);
});

router.post('/backfill/execute/:runId', async (req, res) => {
  const triggeredBy = `admin:${(req as any).user?.email || 'unknown'}`;
  const result = await automationService.executeAutomation(req.params.runId, triggeredBy);
  res.json(result);
});

export { router as automationAdminRoutes };
