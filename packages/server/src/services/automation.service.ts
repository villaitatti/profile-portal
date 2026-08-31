import cron from 'node-cron';
import { Prisma } from '../generated/prisma/client.js';
import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';
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

/**
 * Names the JSM sites a two-site operation failed on, or '' when both succeeded.
 *
 * The JSM helpers swallow per-site errors and communicate through these booleans,
 * so every caller must consult them — otherwise a total JSM outage is
 * indistinguishable from a clean run.
 */
function describeFailedSites(result: { site1: boolean; site2: boolean }): string {
  const failed = [!result.site1 && 'site1', !result.site2 && 'site2'].filter(
    Boolean
  ) as string[];
  return failed.length > 0 ? failed.join(' + ') : '';
}

/**
 * Email IT when a once-a-year automation fails outright.
 *
 * These crons fire on a single minute, once per year. `sendAutomationReport` is
 * only reached on the success path, so a failure used to leave nothing but a log
 * line — and the consequence (outgoing fellows keeping fellows-current and JSM
 * access, or an incoming cohort never being onboarded) persists for twelve
 * months before anyone would notice.
 */
async function reportAutomationFailure(type: AutomationType, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await emailService.sendAutomationReport({
      type,
      academicYear: getCurrentAcademicYear().label,
      processed: 0,
      pending: 0,
      errors: 1,
      details: [
        `The scheduled ${type} automation FAILED before completing.`,
        '',
        `Error: ${message}`,
        '',
        'No changes may have been applied, or only some. Review the server logs, then re-run this automation manually from the Automations admin page.',
      ],
    });
  } catch (reportErr) {
    logger.error({ err: reportErr, type }, 'Automation: failed to send failure report email');
  }
}

// --- Scheduling ---

// The two flags are independent gates: AUTOMATIONS_ENABLED covers only the
// 2x/year July role automations; APPOINTEE_EMAIL_CRON_ENABLED covers only the
// daily bio-email dispatch. Neither implies the other — a dev/staging box can
// run the email cron with the July automations off, and vice versa. An earlier
// version returned early when AUTOMATIONS_ENABLED was false, which silently
// disabled the email cron too and left claim-enqueued rows PENDING forever.
export function registerCronJobs(): void {
  registerJulyAutomationCrons();
  registerAppointeeEmailCron();
}

function registerJulyAutomationCrons(): void {
  if (!env.AUTOMATIONS_ENABLED) {
    logger.info('Automation: AUTOMATIONS_ENABLED is false, July cron jobs not registered');
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
      await reportAutomationFailure('end-of-year-cleanup', err);
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
      await reportAutomationFailure('new-cohort-onboarding', err);
    }
  }, { timezone: 'UTC' });

  logger.info('Automation: cron jobs registered (July 1 + July 2 at 04:00 UTC)');
}

// Daily at 09:00 Europe/Rome — dispatch pending appointee bio emails.
function registerAppointeeEmailCron(): void {
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
      result: { actions } as unknown as Prisma.InputJsonValue,
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
      result: { actions, pending, toOnboard } as unknown as Prisma.InputJsonValue,
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
      result: { actions } as unknown as Prisma.InputJsonValue,
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
  triggeredBy: string,
  expectedType?: AutomationType
): Promise<{ runId: string; status: string }> {
  const dryRun = await prisma.automationRun.findUnique({ where: { id: dryRunId } });
  // HttpError, not bare Error: these are caller mistakes (stale UI, wrong run
  // id), and a bare Error rendered as a 500 "Internal Server Error" while the
  // real message never reached the admin.
  if (!dryRun || dryRun.status !== 'dry_run') {
    throw new HttpError(409, 'Invalid dry run ID or not in dry_run status', 'DRY_RUN_INVALID');
  }

  // The executor dispatches on the *stored* type, so posting a backfill run id
  // to the end-of-year endpoint ran the backfill — correctly, but not the
  // automation the caller asked for. Callers that know which automation they
  // mean pass expectedType so the mismatch is refused instead of surprising
  // someone with a different set of Auth0/JSM mutations.
  if (expectedType && dryRun.type !== expectedType) {
    throw new HttpError(
      409,
      `Dry run ${dryRunId} is a "${dryRun.type}" run, not "${expectedType}"`,
      'DRY_RUN_TYPE_MISMATCH'
    );
  }

  if (!dryRun.completedAt || Date.now() - dryRun.completedAt.getTime() > DRY_RUN_TTL_MS) {
    throw new HttpError(
      409,
      'Dry run has expired (60 minute TTL). Please run a new dry run.',
      'DRY_RUN_EXPIRED'
    );
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

    // failed  = at least one attempt AND every attempt failed
    // partial = some failed, some succeeded
    // completed = no failures
    // Comparing errors to `attempted` (not `processed`) is what makes an
    // all-failure run report `failed`: with the old `errors === processed`
    // test, 5 failures / 0 successes gave `5 === 0` → false → `partial`.
    const status =
      result.errors === 0
        ? 'completed'
        : result.attempted > 0 && result.errors >= result.attempted
          ? 'failed'
          : 'partial';

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
    // Merge the error into the existing result rather than replacing it. The
    // per-item `details` written by the executor are the only record of which
    // Auth0/JSM mutations actually ran, and that is precisely what's needed to
    // reconcile a half-applied July run by hand — overwriting it with an error
    // string destroyed the audit trail at the moment it mattered most.
    const existing = await prisma.automationRun
      .findUnique({ where: { id: run.id }, select: { result: true } })
      .catch(() => null);
    const priorResult: Prisma.JsonObject =
      existing?.result && typeof existing.result === 'object' && !Array.isArray(existing.result)
        ? (existing.result as Prisma.JsonObject)
        : {};

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        result: { ...priorResult, error: String(err) } satisfies Prisma.InputJsonValue,
      },
    });
    throw err;
  }
}

interface ExecutionResult {
  // Users we actually tried to mutate (past the skip/not-found guards).
  // `processed` counts only fully-successful ones and `errors` the failures, so
  // `attempted === processed + errors`. Status is derived from `attempted`, not
  // from `processed`, so a run where every attempt failed is reported `failed`
  // rather than `partial`.
  attempted: number;
  processed: number;
  pending: number;
  errors: number;
  details: string[];
  stats: Record<string, number>;
}

async function executeEndOfYearCleanup(dryRun: { result: unknown }): Promise<ExecutionResult> {
  const { actions } = dryRun.result as { actions: DryRunAction[] };
  const details: string[] = [];
  let attempted = 0;
  let processed = 0;
  let errors = 0;

  // Get unique emails from actions
  const emails = [...new Set(actions.map((a) => a.email))];

  for (const email of emails) {
    // Every row here is a user we intend to mutate — there is no skip guard, so
    // count the attempt up front.
    attempted++;
    try {
      // Remove fellows-current role
      const user = await auth0Service.findUserByEmail(email);
      if (user && env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
        await auth0Service.removeRole(user.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
      }

      // Remove from Current Appointees on both JSM sites.
      //
      // The JSM helpers catch per-site failures internally and report them
      // through the returned booleans, so ignoring the result meant an expired
      // JSM token produced a report email claiming every fellow had been fully
      // removed while they all kept their portal access.
      let jsmDetail = '';
      if (jsmService.isJsmConfigured()) {
        const jsmResult = await jsmService.removeUserFromCurrentAppointees(email);
        const failedSites = describeFailedSites(jsmResult);
        if (failedSites) {
          errors++;
          details.push(
            `PARTIAL: ${email} — removed fellows-current role, but Current Appointees removal FAILED on ${failedSites} (see logs)`
          );
          continue;
        }
        jsmDetail = ' + Current Appointees';
      }

      processed++;
      details.push(`Removed ${email} from fellows-current${jsmDetail}`);
    } catch (err) {
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'End-of-year cleanup: failed for user');
    }
  }

  return { attempted, processed, pending: 0, errors, details, stats: { removed: processed, errors } };
}

async function executeNewCohortOnboarding(dryRun: { result: unknown }): Promise<ExecutionResult> {
  const { toOnboard = [], pending: pendingEmails = [] } = dryRun.result as {
    toOnboard?: string[];
    pending?: string[];
  };
  const details: string[] = [];
  let attempted = 0;
  let processed = 0;
  let errors = 0;

  for (const email of toOnboard) {
    // Look the user up first. A lookup that THROWS is a failed attempt (Auth0
    // unreachable); a lookup that returns null is a genuine skip, not an
    // attempt — keeping the two apart is what lets an all-Auth0-down run be
    // reported `failed` rather than `partial`.
    let user: Awaited<ReturnType<typeof auth0Service.findUserByEmail>>;
    try {
      user = await auth0Service.findUserByEmail(email);
    } catch (err) {
      attempted++;
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'New cohort onboarding: Auth0 lookup failed for user');
      continue;
    }
    if (!user) {
      details.push(`SKIPPED: ${email} — Auth0 account not found (may have been deleted)`);
      continue;
    }

    attempted++;
    try {
      // Add fellows-current role
      if (env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
        await auth0Service.assignRole(user.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
      }

      // Add to Current Appointees on both JSM sites
      let jsmDetail = '';
      if (jsmService.isJsmConfigured()) {
        const current = await jsmService.addUserToCurrentAppointees(email, user.name || email);
        // Verify they're in Former Appointees too
        const former = await jsmService.addUserToFormerAppointees(email, user.name || email);
        const failed = [
          describeFailedSites(current) && `Current Appointees (${describeFailedSites(current)})`,
          describeFailedSites(former) && `Former Appointees (${describeFailedSites(former)})`,
        ]
          .filter(Boolean)
          .join('; ');
        if (failed) {
          errors++;
          details.push(
            `PARTIAL: ${email} — assigned fellows-current role, but JSM org add FAILED for ${failed} (see logs)`
          );
          continue;
        }
        jsmDetail = ' + Current Appointees';
      }

      processed++;
      details.push(`Onboarded ${email} — fellows-current${jsmDetail}`);
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
    attempted,
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
  let attempted = 0;
  let processed = 0;
  let errors = 0;

  // Get unique emails
  const emails = [...new Set(actions.map((a) => a.email))];

  for (const email of emails) {
    // As in new-cohort onboarding: a lookup that throws is a failed attempt; a
    // null result is a genuine skip, not an attempt.
    let user: Awaited<ReturnType<typeof auth0Service.findUserByEmail>>;
    try {
      user = await auth0Service.findUserByEmail(email);
    } catch (err) {
      attempted++;
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'Backfill: Auth0 lookup failed for user');
      continue;
    }
    if (!user) {
      details.push(`SKIPPED: ${email} — Auth0 account not found`);
      continue;
    }

    attempted++;
    try {
      const displayName = user.name || email;
      const jsmFailures: string[] = [];

      // Add to Former Appointees (all fellows)
      if (jsmService.isJsmConfigured()) {
        const former = await jsmService.addUserToFormerAppointees(email, displayName);
        const failed = describeFailedSites(former);
        if (failed) jsmFailures.push(`Former Appointees (${failed})`);
      }

      // Check if current fellow needs Current Appointees too
      const needsCurrent = actions.some(
        (a) => a.email === email && a.needsCurrentAppointees
      );
      if (needsCurrent) {
        if (jsmService.isJsmConfigured()) {
          const current = await jsmService.addUserToCurrentAppointees(email, displayName);
          const failed = describeFailedSites(current);
          if (failed) jsmFailures.push(`Current Appointees (${failed})`);
        }
        if (env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
          await auth0Service.assignRole(user.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
        }
      }

      if (jsmFailures.length > 0) {
        errors++;
        details.push(
          `PARTIAL: ${email} — JSM org add FAILED for ${jsmFailures.join('; ')} (see logs)`
        );
        continue;
      }

      details.push(
        needsCurrent
          ? `Backfilled ${email} — Former + Current Appointees + fellows-current`
          : `Backfilled ${email} — Former Appointees`
      );

      processed++;
    } catch (err) {
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, email }, 'Backfill: failed for user');
    }
  }

  return { attempted, processed, pending: 0, errors, details, stats: { backfilled: processed, errors } };
}
