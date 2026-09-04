import cron from 'node-cron';
import { Prisma } from '../generated/prisma/client.js';
import { env, isDevMode } from '../env.js';
import { hashEmail } from '../lib/hash-email.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';
import * as auth0Service from './auth0.service.js';
import * as civicrmService from './civicrm.service.js';
import * as jsmService from './atlassian-jsm.service.js';
import * as emailService from './email.service.js';
import * as appointeeEmailService from './appointee-email.service.js';
import { pruneTrashedImages } from './image-upload.service.js';
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
 * The JSM helpers swallow per-site errors and communicate through per-site
 * results (booleans for the add helpers, a tri-state for removal — callers map
 * it to ok/failed booleans here), so every caller must consult them —
 * otherwise a total JSM outage is indistinguishable from a clean run.
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
      outcome: 'failed',
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

// Consecutive-failure tracking for the daily bio-email dispatch. Unlike the
// July automations (which email IT on any failure), a daily cron that alerts
// on every failure would spam IT through a one-day upstream blip that the next
// run heals anyway — pending rows stay PENDING and are retried. A failure day
// is a dispatch that THREW or one that resolved with failed/deferred > 0
// (dispatchPendingEmails catches per-message failures and resolves with
// counts). Module state is safe here because the server is deliberately
// single-instance (ARCHITECTURE.md); a restart resets the streak, which at
// worst delays the alert by another N days.
const BIO_DISPATCH_FAILURE_ALERT_EVERY = 3;
let consecutiveBioDispatchFailures = 0;

type BioDispatchCounts = Awaited<ReturnType<typeof appointeeEmailService.dispatchPendingEmails>>;

async function reportBioDispatchFailure(
  failures: number,
  cause: { err?: unknown; counts?: BioDispatchCounts }
): Promise<void> {
  try {
    await emailService.sendDailyDispatchFailureAlert({
      consecutiveFailures: failures,
      ...(cause.err !== undefined
        ? { lastError: cause.err instanceof Error ? cause.err.message : String(cause.err) }
        : {}),
      ...(cause.counts ? { lastRunCounts: cause.counts } : {}),
    });
  } catch (reportErr) {
    // An alert failure must only log — never throw back into the cron.
    logger.error({ err: reportErr }, 'Automation: failed to send bio-email dispatch failure alert');
  }
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
          // dispatchPendingEmails catches per-message failures and RESOLVES
          // with counts, so a full SES/CiviCRM outage is a resolved run with
          // failed/deferred > 0 — it must count toward the streak like a
          // thrown error, or a daily reset here would keep the alert from
          // ever firing for exactly the failures it exists to detect.
          if (result.failed > 0 || result.deferred > 0) {
            consecutiveBioDispatchFailures++;
            logger.error(
              { ...result, consecutiveFailures: consecutiveBioDispatchFailures },
              'Automation: scheduled bio-email dispatch had failures'
            );
            if (consecutiveBioDispatchFailures % BIO_DISPATCH_FAILURE_ALERT_EVERY === 0) {
              await reportBioDispatchFailure(consecutiveBioDispatchFailures, { counts: result });
            }
          } else if (result.processed > 0) {
            consecutiveBioDispatchFailures = 0;
          }
          // processed === 0 with nothing failed is an idle day: no evidence
          // the pipeline works or is broken, so the streak carries over.
        } catch (err) {
          consecutiveBioDispatchFailures++;
          logger.error(
            { err, consecutiveFailures: consecutiveBioDispatchFailures },
            'Automation: scheduled bio-email dispatch failed'
          );
          // Alert on every Nth consecutive failure (3, 6, 9, …): a prolonged
          // outage keeps nudging IT without a daily email per failure.
          if (consecutiveBioDispatchFailures % BIO_DISPATCH_FAILURE_ALERT_EVERY === 0) {
            await reportBioDispatchFailure(consecutiveBioDispatchFailures, { err });
          }
        }
        // Piggyback on the daily tick: catches a July automation that wedged
        // mid-run while the process stayed alive (the boot check only runs on
        // restart). Never throws — failures are logged inside.
        await checkMissedJulyAutomations();
        // Same tick: prune uploads/trash/ entries past the 7-day retention
        // (deferred image deletion, image-upload.service.ts). Never throws.
        await pruneTrashedImages();
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

// --- Missed-fire detection ---

// The July crons fire on a single minute, once per year. If the container is
// down at fire time (deploy, crash, host outage) node-cron never replays the
// tick, and the annual automation silently does not happen — outgoing fellows
// keep fellows-current and JSM access for a year. This check runs at boot and
// piggybacks on the daily bio-email cron: when the scheduled moment for the
// current academic year has passed and no run of that type reached
// completed/partial, alert IT. An alert is sufficient — the admin UI has a
// manual re-run — and it repeats on each check until someone runs the
// automation (deliberate: an unresolved missed July run must not fade away).
//
// Must match the cron expressions in registerJulyAutomationCrons: July 1 and
// July 2 at 04:00 UTC. Month is 0-indexed (6 = July), consistent with the
// UTC-only date math in utils/academic-year.ts.
const JULY_AUTOMATION_SCHEDULE: {
  type: AutomationType;
  utcMonth: number;
  utcDay: number;
  utcHour: number;
}[] = [
  { type: 'end-of-year-cleanup', utcMonth: 6, utcDay: 1, utcHour: 4 },
  { type: 'new-cohort-onboarding', utcMonth: 6, utcDay: 2, utcHour: 4 },
];

// A run stuck in `executing` has no lease reclaim, so beyond this generous TTL
// it is treated as missed rather than in-progress (a real July run finishes in
// minutes; 6h means the process died mid-run and nothing will finish it).
const EXECUTING_STALE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Human-facing date for the alert email body: "01 July 2026" (never
// ambiguous numeric formats). UTC accessors for the same reason as
// utils/academic-year.ts.
function formatUtcDateHuman(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

async function reportMissedAutomation(
  type: AutomationType,
  academicYear: string,
  scheduledAt: Date
): Promise<void> {
  try {
    // Dedicated alert helper, not sendAutomationReport: its "… Complete"
    // subject would deliver this incident under a success-sounding subject.
    await emailService.sendMissedAutomationAlert({
      type,
      academicYear,
      details: [
        `The scheduled ${type} automation appears to have NEVER COMPLETED for academic year ${academicYear}.`,
        '',
        `It was scheduled for ${formatUtcDateHuman(scheduledAt)} at 04:00 UTC, that moment has passed, and no completed (or partially completed) run of this type exists for this academic year. The server was most likely down or restarting at fire time, or a run died mid-execution.`,
        '',
        'Action: review the run history on the Automations admin page, then run this automation manually (dry run + execute).',
      ],
    });
  } catch (err) {
    // An alert failure must only log — this runs from boot and cron paths.
    logger.error({ err, type }, 'Automation: failed to send missed-automation alert email');
  }
}

/**
 * Alerts IT when a July automation's scheduled moment for the current academic
 * year has passed without a completed/partial run. A zero-action dry run also
 * satisfies the check — the cron deliberately skips execution when there is
 * nothing to do, so that year legitimately produces no execution row. A run
 * still `executing` within EXECUTING_STALE_TTL_MS counts as in-progress (no
 * alert yet); older than that it is treated as missed.
 *
 * Never throws: callers are boot (must not delay listen) and the daily cron.
 * Academic-year boundaries reuse getCurrentAcademicYear's UTC math — the AY
 * starts July 1, so from July 1 onward the scheduled dates belong to the AY
 * that just started.
 */
export async function checkMissedJulyAutomations(now: Date = new Date()): Promise<void> {
  // Same gate as the July crons: where they are deliberately disabled
  // (dev/staging), a missing run is not an incident.
  if (!env.AUTOMATIONS_ENABLED) return;

  const ay = getCurrentAcademicYear(now);
  const startYear = ay.start.getUTCFullYear();

  for (const sched of JULY_AUTOMATION_SCHEDULE) {
    try {
      const scheduledAt = new Date(
        Date.UTC(startYear, sched.utcMonth, sched.utcDay, sched.utcHour)
      );
      if (now.getTime() <= scheduledAt.getTime()) continue; // not due yet this AY

      const satisfied = await prisma.automationRun.findFirst({
        where: {
          type: sched.type,
          academicYear: ay.label,
          status: { in: ['completed', 'partial'] },
        },
        select: { id: true },
      });
      if (satisfied) continue;

      // A cron tick whose dry run found zero actions deliberately skips
      // executeAutomation (registerJulyAutomationCrons), leaving only a
      // dry_run-status row — a legitimate no-op year, not a missed run. Any
      // zero-action dry run of this type/AY counts, including one an admin
      // triggered manually: it proves equally that there was nothing to do,
      // and the academicYear filter already bounds the window to this AY.
      // 'consumed' rows deliberately do NOT satisfy: consumed means an
      // execution started, and that execution's own row must reach
      // completed/partial — otherwise a crashed execution would go unalerted.
      const dryRuns = await prisma.automationRun.findMany({
        where: { type: sched.type, academicYear: ay.label, status: 'dry_run' },
        select: { result: true },
      });
      const hasZeroActionDryRun = dryRuns.some((r) => {
        const actions = (r.result as { actions?: unknown[] } | null)?.actions;
        return Array.isArray(actions) && actions.length === 0;
      });
      if (hasZeroActionDryRun) continue;

      const inFlight = await prisma.automationRun.findFirst({
        where: {
          type: sched.type,
          academicYear: ay.label,
          status: 'executing',
          startedAt: { gt: new Date(now.getTime() - EXECUTING_STALE_TTL_MS) },
        },
        select: { id: true },
      });
      if (inFlight) continue;

      logger.error(
        { type: sched.type, academicYear: ay.label, scheduledAt },
        'Automation: scheduled July automation appears to have been missed — alerting IT'
      );
      await reportMissedAutomation(sched.type, ay.label, scheduledAt);
    } catch (err) {
      logger.error({ err, type: sched.type }, 'Automation: missed-fire check failed');
    }
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
  if (dryRun?.status === 'consumed') {
    throw new HttpError(
      409,
      'This dry run has already been executed. Run a new dry run to execute again.',
      'DRY_RUN_ALREADY_EXECUTED'
    );
  }
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

  // Replay/concurrency guard: consume the dry run atomically before executing.
  // The status flip dry_run → consumed can succeed for exactly one caller, so
  // a double-click or replayed POST of the same runId cannot run the July
  // automation twice concurrently against Auth0/JSM. The executing row is
  // created in the same transaction so a failed create rolls the consumption
  // back instead of burning a dry run nothing ever ran from. (Mirrors the
  // sync service's transactional prior-execution check in executeSync.)
  const run = await prisma.$transaction(async (tx) => {
    const consumed = await tx.automationRun.updateMany({
      where: { id: dryRunId, status: 'dry_run' },
      data: { status: 'consumed' },
    });
    if (consumed.count !== 1) {
      throw new HttpError(
        409,
        'This dry run has already been executed. Run a new dry run to execute again.',
        'DRY_RUN_ALREADY_EXECUTED'
      );
    }
    return tx.automationRun.create({
      data: {
        type: dryRun.type,
        status: 'executing',
        triggeredBy,
        academicYear: dryRun.academicYear,
        result: { operations: [] },
      },
    });
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
      outcome: status,
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
      // The JSM helper catches per-site errors internally and reports through
      // the returned tri-state, so ignoring the result meant an expired JSM
      // token produced a report email claiming every fellow had been fully
      // removed while they all kept their portal access. Only 'failed' counts
      // as an error: 'not-found' means the fellow was never provisioned in
      // JSM — nothing to remove — and counting it used to produce a false
      // PARTIAL July report.
      let jsmDetail = '';
      if (jsmService.isJsmConfigured()) {
        const jsmResult = await jsmService.removeUserFromCurrentAppointees(email);
        const failedSites = describeFailedSites({
          site1: jsmResult.site1 !== 'failed',
          site2: jsmResult.site2 !== 'failed',
        });
        if (failedSites) {
          errors++;
          details.push(
            `PARTIAL: ${email} — removed fellows-current role, but Current Appointees removal FAILED on ${failedSites} (see logs)`
          );
          continue;
        }
        const notFoundSites = [
          jsmResult.site1 === 'not-found' && 'site1',
          jsmResult.site2 === 'not-found' && 'site2',
        ].filter(Boolean) as string[];
        jsmDetail =
          notFoundSites.length === 2
            ? ' (no JSM account — nothing to remove)'
            : notFoundSites.length === 1
              ? ` + Current Appointees (${notFoundSites[0]}: no JSM account — nothing to remove)`
              : ' + Current Appointees';
      }

      processed++;
      details.push(`Removed ${email} from fellows-current${jsmDetail}`);
    } catch (err) {
      errors++;
      details.push(`ERROR: ${email} — ${err instanceof Error ? err.message : String(err)}`);
      logger.error({ err, emailHash: hashEmail(email) }, 'End-of-year cleanup: failed for user');
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
      logger.error(
        { err, emailHash: hashEmail(email) },
        'New cohort onboarding: Auth0 lookup failed for user'
      );
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
      logger.error({ err, emailHash: hashEmail(email) }, 'New cohort onboarding: failed for user');
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
      logger.error({ err, emailHash: hashEmail(email) }, 'Backfill: Auth0 lookup failed for user');
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
      logger.error({ err, emailHash: hashEmail(email) }, 'Backfill: failed for user');
    }
  }

  return { attempted, processed, pending: 0, errors, details, stats: { backfilled: processed, errors } };
}
