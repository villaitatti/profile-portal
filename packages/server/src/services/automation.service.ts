import cron from 'node-cron';
import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import * as auth0Service from './auth0.service.js';
import * as civicrmService from './civicrm.service.js';
import * as jsmService from './atlassian-jsm.service.js';
import * as emailService from './email.service.js';
import * as appointeeEmailService from './appointee-email.service.js';
import { classifyFellowship } from '../utils/eligibility.js';
import { getCurrentAcademicYear } from '../utils/academic-year.js';

type AutomationType = 'end-of-year-cleanup' | 'new-cohort-onboarding' | 'backfill';

interface DryRunResult {
  runId: string;
  type: AutomationType;
  academicYear: string;
  actions: DryRunAction[];
}

interface DryRunAction {
  email: string;
  name: string;
  action: string;
  needsCurrentAppointees?: boolean;
}

// --- Scheduling ---

export function registerCronJobs(): void {
  if (!env.AUTOMATIONS_ENABLED) {
    logger.info('Automation: AUTOMATIONS_ENABLED is false, scheduled cron jobs not registered');
    return;
  }

  // July 1 at 04:00 UTC — end-of-year cleanup
  cron.schedule('0 4 1 7 *', async () => {
    logger.info('Automation: starting scheduled end-of-year cleanup');
    try {
      const dryRun = await runEndOfYearDryRun('cron');
      if (dryRun.actions.length > 0) {
        await executeAutomation(dryRun.runId, 'cron');
      } else {
        logger.info('Automation: end-of-year cleanup has no actions, skipping execute');
      }
    } catch (err) {
      logger.error({ err }, 'Automation: scheduled end-of-year cleanup failed');
    }
  }, { timezone: 'UTC' });

  // July 2 at 04:00 UTC — new cohort onboarding
  cron.schedule('0 4 2 7 *', async () => {
    logger.info('Automation: starting scheduled new-cohort onboarding');
    try {
      const dryRun = await runNewCohortDryRun('cron');
      if (dryRun.actions.length > 0) {
        await executeAutomation(dryRun.runId, 'cron');
      } else {
        logger.info('Automation: new-cohort onboarding has no actions, skipping execute');
      }
    } catch (err) {
      logger.error({ err }, 'Automation: scheduled new-cohort onboarding failed');
    }
  }, { timezone: 'UTC' });

  logger.info('Automation: cron jobs registered (July 1 + July 2 at 04:00 UTC)');

  // Daily at 09:00 Europe/Rome — dispatch pending appointee bio emails.
  // Gated separately from AUTOMATIONS_ENABLED so the 2x/year July automations
  // and the daily bio-email dispatch can be toggled independently.
  if (env.APPOINTEE_EMAIL_CRON_ENABLED) {
    cron.schedule(
      '0 9 * * *',
      async () => {
        logger.info('Automation: starting scheduled bio-email dispatch');
        try {
          const result = await appointeeEmailService.dispatchPendingEmails();
          logger.info(result, 'Automation: bio-email dispatch finished');
        } catch (err) {
          logger.error({ err }, 'Automation: scheduled bio-email dispatch failed');
        }
      },
      { timezone: 'Europe/Rome' }
    );
    logger.info('Automation: bio-email cron registered (daily 09:00 Europe/Rome)');
  } else {
    logger.info(
      'Automation: APPOINTEE_EMAIL_CRON_ENABLED is false, bio-email cron not registered'
    );
  }
}

// --- Dry Runs ---

export async function runEndOfYearDryRun(triggeredBy: string): Promise<DryRunResult> {
  const ay = getCurrentAcademicYear();
  const actions: DryRunAction[] = [];

  // Fetch all users with fellows-current role
  if (!env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
    throw new Error('AUTH0_FELLOWS_CURRENT_ROLE_ID not configured');
  }

  const currentFellows = await auth0Service.listUsersByRole(env.AUTH0_FELLOWS_CURRENT_ROLE_ID);

  for (const fellow of currentFellows) {
    actions.push({
      email: fellow.email,
      name: fellow.name || fellow.email,
      action: 'remove from fellows-current role (Auth0)',
    });
    actions.push({
      email: fellow.email,
      name: fellow.name || fellow.email,
      action: 'remove from I Tatti Current Appointees (both JSM sites)',
    });
  }

  const run = await prisma.automationRun.create({
    data: {
      type: 'end-of-year-cleanup',
      status: 'dry_run',
      triggeredBy,
      academicYear: ay.label,
      result: { actions } as any,
      stats: { toRemove: currentFellows.length },
      completedAt: new Date(),
    },
  });

  return { runId: run.id, type: 'end-of-year-cleanup', academicYear: ay.label, actions };
}

export async function runNewCohortDryRun(triggeredBy: string): Promise<DryRunResult> {
  const ay = getCurrentAcademicYear();
  const actions: DryRunAction[] = [];

  // Fetch new fellows from CiviCRM (fellowship starting this academic year)
  const allFellows = await civicrmService.getFellowsWithContacts();
  const newCohort = allFellows.filter((f) => {
    const classification = classifyFellowship(f.startDate, f.endDate);
    return classification === 'current';
  });

  const pending: string[] = [];
  const toOnboard: string[] = [];

  for (const fellow of newCohort) {
    const auth0User = await auth0Service.findUserByEmail(fellow.email);
    if (!auth0User) {
      pending.push(fellow.email);
      actions.push({
        email: fellow.email,
        name: `${fellow.firstName} ${fellow.lastName}`,
        action: 'pending — no VIT ID claimed yet',
      });
    } else {
      toOnboard.push(fellow.email);
      actions.push({
        email: fellow.email,
        name: `${fellow.firstName} ${fellow.lastName}`,
        action: 'add to fellows-current role (Auth0) + I Tatti Current Appointees (both JSM sites)',
      });
    }
  }

  const run = await prisma.automationRun.create({
    data: {
      type: 'new-cohort-onboarding',
      status: 'dry_run',
      triggeredBy,
      academicYear: ay.label,
      result: { actions, pending, toOnboard } as any,
      stats: { toOnboard: toOnboard.length, pending: pending.length },
      completedAt: new Date(),
    },
  });

  return { runId: run.id, type: 'new-cohort-onboarding', academicYear: ay.label, actions };
}

export async function runBackfillDryRun(triggeredBy: string): Promise<DryRunResult> {
  const ay = getCurrentAcademicYear();
  const actions: DryRunAction[] = [];

  // Fetch all users with fellows role
  const allFellows = await auth0Service.listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID);

  for (const fellow of allFellows) {
    actions.push({
      email: fellow.email,
      name: fellow.name || fellow.email,
      action: 'add to I Tatti Former Appointees (both JSM sites)',
    });

    // Check if they should also be in Current Appointees
    if (fellow.civicrmId) {
      const fellowships = await civicrmService.getFellowships(Number(fellow.civicrmId));
      const isCurrent = fellowships.some(
        (f) => classifyFellowship(f.startDate, f.endDate) === 'current'
      );
      if (isCurrent) {
        actions.push({
          email: fellow.email,
          name: fellow.name || fellow.email,
          action: 'add to I Tatti Current Appointees (both JSM sites) + fellows-current role',
          needsCurrentAppointees: true,
        });
      }
    }
  }

  const run = await prisma.automationRun.create({
    data: {
      type: 'backfill',
      status: 'dry_run',
      triggeredBy,
      academicYear: ay.label,
      result: { actions } as any,
      stats: { total: allFellows.length },
      completedAt: new Date(),
    },
  });

  return { runId: run.id, type: 'backfill', academicYear: ay.label, actions };
}

// --- Execution ---

const DRY_RUN_TTL_MS = 60 * 60 * 1000; // 60 minutes

export async function executeAutomation(
  dryRunId: string,
  triggeredBy: string
): Promise<{ runId: string; status: string }> {
  const dryRun = await prisma.automationRun.findUnique({ where: { id: dryRunId } });
  if (!dryRun || dryRun.status !== 'dry_run') {
    throw new Error('Invalid dry run ID or not in dry_run status');
  }

  if (!dryRun.completedAt || Date.now() - dryRun.completedAt.getTime() > DRY_RUN_TTL_MS) {
    throw new Error('Dry run has expired (60 minute TTL). Please run a new dry run.');
  }

  if (env.NODE_ENV !== 'production' && !isDevMode) {
    throw new Error('Execution is disabled in non-production environments. Use dry run to preview changes.');
  }

  const run = await prisma.automationRun.create({
    data: {
      type: dryRun.type,
      status: 'executing',
      triggeredBy,
      academicYear: dryRun.academicYear,
      result: { operations: [] },
    },
  });

  try {
    let result;
    switch (dryRun.type) {
      case 'end-of-year-cleanup':
        result = await executeEndOfYearCleanup(dryRun);
        break;
      case 'new-cohort-onboarding':
        result = await executeNewCohortOnboarding(dryRun);
        break;
      case 'backfill':
        result = await executeBackfill(dryRun);
        break;
      default:
        throw new Error(`Unknown automation type: ${dryRun.type}`);
    }

    const hasErrors = result.errors > 0;
    const status = result.errors === result.processed ? 'failed' : hasErrors ? 'partial' : 'completed';

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt: new Date(),
        result: { operations: result.details },
        stats: result.stats,
      },
    });

    // Send email report
    await emailService.sendAutomationReport({
      type: dryRun.type as AutomationType,
      academicYear: dryRun.academicYear,
      processed: result.processed,
      pending: result.pending,
      errors: result.errors,
      details: result.details,
    });

    return { runId: run.id, status };
  } catch (err) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: 'failed', completedAt: new Date(), result: { error: String(err) } },
    });
    throw err;
  }
}

interface ExecutionResult {
  processed: number;
  pending: number;
  errors: number;
  details: string[];
  stats: Record<string, number>;
}

async function executeEndOfYearCleanup(dryRun: { result: unknown }): Promise<ExecutionResult> {
  const { actions } = dryRun.result as { actions: DryRunAction[] };
  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  // Get unique emails from actions
  const emails = [...new Set(actions.map((a) => a.email))];

  for (const email of emails) {
    try {
      // Remove fellows-current role
      const user = await auth0Service.findUserByEmail(email);
      if (user && env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
        await auth0Service.removeRole(user.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
      }

      // Remove from Current Appointees on both JSM sites
      if (jsmService.isJsmConfigured()) {
        await jsmService.removeUserFromCurrentAppointees(email);
      }

      processed++;
      details.push(`Removed ${email} from fellows-current + Current Appointees`);
    } catch (err) {
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'End-of-year cleanup: failed for user');
    }
  }

  return { processed, pending: 0, errors, details, stats: { removed: processed, errors } };
}

async function executeNewCohortOnboarding(dryRun: { result: unknown }): Promise<ExecutionResult> {
  const { toOnboard = [], pending: pendingEmails = [] } = dryRun.result as {
    toOnboard?: string[];
    pending?: string[];
  };
  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  for (const email of toOnboard) {
    try {
      const user = await auth0Service.findUserByEmail(email);
      if (!user) {
        details.push(`SKIPPED: ${email} — Auth0 account not found (may have been deleted)`);
        continue;
      }

      // Add fellows-current role
      if (env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
        await auth0Service.assignRole(user.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
      }

      // Add to Current Appointees on both JSM sites
      if (jsmService.isJsmConfigured()) {
        await jsmService.addUserToCurrentAppointees(email, user.name || email);
        // Verify they're in Former Appointees too
        await jsmService.addUserToFormerAppointees(email, user.name || email);
      }

      processed++;
      details.push(`Onboarded ${email} — fellows-current + Current Appointees`);
    } catch (err) {
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'New cohort onboarding: failed for user');
    }
  }

  for (const email of pendingEmails) {
    details.push(`PENDING: ${email} — no VIT ID claimed yet`);
  }

  return {
    processed,
    pending: pendingEmails.length,
    errors,
    details,
    stats: { added: processed, pending: pendingEmails.length, errors },
  };
}

async function executeBackfill(dryRun: { result: unknown }): Promise<ExecutionResult> {
  const { actions } = dryRun.result as { actions: DryRunAction[] };
  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  // Get unique emails
  const emails = [...new Set(actions.map((a) => a.email))];

  for (const email of emails) {
    try {
      const user = await auth0Service.findUserByEmail(email);
      if (!user) {
        details.push(`SKIPPED: ${email} — Auth0 account not found`);
        continue;
      }

      const displayName = user.name || email;

      // Add to Former Appointees (all fellows)
      if (jsmService.isJsmConfigured()) {
        await jsmService.addUserToFormerAppointees(email, displayName);
      }

      // Check if current fellow needs Current Appointees too
      const needsCurrent = actions.some(
        (a) => a.email === email && a.needsCurrentAppointees
      );
      if (needsCurrent) {
        if (jsmService.isJsmConfigured()) {
          await jsmService.addUserToCurrentAppointees(email, displayName);
        }
        if (env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
          await auth0Service.assignRole(user.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
        }
        details.push(`Backfilled ${email} — Former + Current Appointees + fellows-current`);
      } else {
        details.push(`Backfilled ${email} — Former Appointees`);
      }

      processed++;
    } catch (err) {
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'Backfill: failed for user');
    }
  }

  return { processed, pending: 0, errors, details, stats: { backfilled: processed, errors } };
}
