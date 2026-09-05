import { describe, it, expect, vi, beforeEach } from 'vitest';

// Drives executeAutomation through the end-of-year executor to pin the run
// status derivation: an all-failure run must report `failed`, a mixed run
// `partial`, a clean run `completed`. The old `errors === processed` test
// mis-reported an all-failure run (5 errors / 0 processed → 5 === 0 → false) as
// `partial`; status now compares errors to the `attempted` count.

const { mockPrisma, auth0, jsm, email, appointeeEmail, envMock } = vi.hoisted(() => {
  const automationRun = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  return {
    mockPrisma: {
      automationRun,
      // Runs the interactive-transaction callback against the same stubs,
      // like helpers/mocks.ts prismaMock does.
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: { automationRun: typeof automationRun }) => unknown)({ automationRun })
          : Promise.all(arg as Promise<unknown>[])
      ),
    },
    auth0: {
      findUserByEmail: vi.fn(),
      removeRole: vi.fn(),
      assignRole: vi.fn(),
    },
    jsm: {
      isJsmConfigured: vi.fn(() => true),
      removeUserFromCurrentAppointees: vi.fn(),
    },
    email: {
      sendAutomationReport: vi.fn(),
      sendMissedAutomationAlert: vi.fn(),
      sendDailyDispatchFailureAlert: vi.fn(),
    },
    appointeeEmail: { dispatchPendingEmails: vi.fn() },
    envMock: {
      NODE_ENV: 'production',
      AUTH0_FELLOWS_CURRENT_ROLE_ID: 'rol_current',
      AUTOMATIONS_ENABLED: false,
      APPOINTEE_EMAIL_CRON_ENABLED: false,
    },
  };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../services/auth0.service.js', () => auth0);
vi.mock('../../services/atlassian-jsm.service.js', () => jsm);
vi.mock('../../services/civicrm.service.js', () => ({ getFellowsWithContacts: vi.fn() }));
vi.mock('../../services/email.service.js', () => email);
vi.mock('../../services/appointee-email.service.js', () => appointeeEmail);
vi.mock('../../services/image-upload.service.js', () => ({ pruneTrashedImages: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../env.js', () => ({ env: envMock, isDevMode: false }));

import cron from 'node-cron';
import {
  checkMissedJulyAutomations,
  executeAutomation,
  registerCronJobs,
} from '../../services/automation.service.js';
import { logger } from '../../lib/logger.js';

const EMAILS = ['a@x.org', 'b@x.org', 'c@x.org'];

function primeDryRun() {
  mockPrisma.automationRun.findUnique.mockResolvedValue({
    id: 'dry-1',
    type: 'end-of-year-cleanup',
    status: 'dry_run',
    academicYear: '2025-2026',
    completedAt: new Date(), // within the 60-min TTL
    result: { actions: EMAILS.map((email) => ({ email, name: email, action: 'remove' })) },
  });
  mockPrisma.automationRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.automationRun.create.mockResolvedValue({ id: 'run-1' });
  mockPrisma.automationRun.update.mockResolvedValue({});
  auth0.findUserByEmail.mockImplementation(async (e: string) => ({ user_id: `auth0|${e}` }));
  auth0.removeRole.mockResolvedValue(undefined);
  email.sendAutomationReport.mockResolvedValue(undefined);
}

function lastUpdateStatus() {
  const calls = mockPrisma.automationRun.update.mock.calls;
  return calls[calls.length - 1][0].data.status;
}

describe('executeAutomation status derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jsm.isJsmConfigured.mockReturnValue(true);
  });

  it('reports FAILED when every JSM removal fails', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees.mockResolvedValue({ site1: 'failed', site2: 'failed' });

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('failed');
    expect(lastUpdateStatus()).toBe('failed');
  });

  it('reports PARTIAL when some succeed and some fail', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees
      .mockResolvedValueOnce({ site1: 'removed', site2: 'removed' }) // a@x.org succeeds
      .mockResolvedValue({ site1: 'failed', site2: 'failed' }); // the rest fail

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('partial');
    expect(lastUpdateStatus()).toBe('partial');
  });

  it('reports COMPLETED when every removal succeeds', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees.mockResolvedValue({ site1: 'removed', site2: 'removed' });

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('completed');
    expect(lastUpdateStatus()).toBe('completed');
  });

  it('reports COMPLETED when no fellow has a JSM account — not-found is a no-op, not an error', async () => {
    // Regression: a cohort of fellows who were never provisioned in JSM used to
    // count every 'no customer found' as a failed site, so a perfectly clean
    // July cleanup arrived as a false-alarm PARTIAL report.
    primeDryRun();
    jsm.removeUserFromCurrentAppointees.mockResolvedValue({
      site1: 'not-found',
      site2: 'not-found',
    });

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('completed');
    expect(lastUpdateStatus()).toBe('completed');
    // The report still says what happened, without alarming: the detail line
    // marks the JSM side as a no-op rather than a failure.
    expect(email.sendAutomationReport).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'completed',
        errors: 0,
        details: expect.arrayContaining([
          expect.stringContaining('no JSM account — nothing to remove'),
        ]),
      })
    );
  });

  it('reports PARTIAL when one site removes and the other fails (not-found does not mask it)', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees
      .mockResolvedValueOnce({ site1: 'removed', site2: 'not-found' }) // a@x.org: clean no-op on site2
      .mockResolvedValue({ site1: 'not-found', site2: 'failed' }); // the rest: site2 genuinely failed

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('partial');
    expect(email.sendAutomationReport).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: 2,
        details: expect.arrayContaining([expect.stringContaining('FAILED on site2')]),
      })
    );
  });

  it('refuses a run whose stored type does not match the endpoint', async () => {
    primeDryRun();

    await expect(
      executeAutomation('dry-1', 'admin:test', 'backfill')
    ).rejects.toThrow(/is a "end-of-year-cleanup" run, not "backfill"/);
    expect(mockPrisma.automationRun.create).not.toHaveBeenCalled();
  });
});

// Regression: the two cron flags must be independent gates. An earlier version
// of registerCronJobs returned early when AUTOMATIONS_ENABLED was false, which
// silently disabled the bio-email cron too — a deployment setting only
// APPOINTEE_EMAIL_CRON_ENABLED=true never dispatched, and claim-enqueued rows
// stayed PENDING forever.
describe('registerCronJobs flag gating', () => {
  const scheduleMock = vi.mocked(cron.schedule);

  function scheduledExpressions(): string[] {
    return scheduleMock.mock.calls.map((call) => call[0] as string);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.AUTOMATIONS_ENABLED = false;
    envMock.APPOINTEE_EMAIL_CRON_ENABLED = false;
  });

  it('registers the daily bio-email cron even when AUTOMATIONS_ENABLED is false', () => {
    envMock.APPOINTEE_EMAIL_CRON_ENABLED = true;

    registerCronJobs();

    expect(scheduledExpressions()).toEqual(['0 9 * * *']);
  });

  it('registers the July crons without the bio-email cron when only AUTOMATIONS_ENABLED is true', () => {
    envMock.AUTOMATIONS_ENABLED = true;

    registerCronJobs();

    expect(scheduledExpressions()).toEqual(['0 4 1 7 *', '0 4 2 7 *']);
  });

  it('registers all three crons when both flags are true', () => {
    envMock.AUTOMATIONS_ENABLED = true;
    envMock.APPOINTEE_EMAIL_CRON_ENABLED = true;

    registerCronJobs();

    expect(scheduledExpressions()).toEqual(['0 4 1 7 *', '0 4 2 7 *', '0 9 * * *']);
  });

  it('registers nothing when both flags are false', () => {
    registerCronJobs();

    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

// Replay/concurrency guard: executing a dry run consumes it atomically
// (dry_run → consumed via updateMany requiring count === 1), so a double-click
// or re-POST of the same runId cannot run the July automation twice against
// Auth0/JSM.
describe('executeAutomation replay guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jsm.isJsmConfigured.mockReturnValue(true);
  });

  it('consumes the dry run atomically on the winning execute', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees.mockResolvedValue({ site1: 'removed', site2: 'removed' });

    await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(mockPrisma.automationRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'dry-1', status: 'dry_run' },
      data: { status: 'consumed' },
    });
  });

  it('returns 409 DRY_RUN_ALREADY_EXECUTED when the dry run was already consumed', async () => {
    primeDryRun();
    mockPrisma.automationRun.findUnique.mockResolvedValue({
      id: 'dry-1',
      type: 'end-of-year-cleanup',
      status: 'consumed',
      academicYear: '2025-2026',
      completedAt: new Date(),
      result: { actions: [] },
    });

    await expect(
      executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup')
    ).rejects.toMatchObject({
      status: 409,
      code: 'DRY_RUN_ALREADY_EXECUTED',
    });
    expect(mockPrisma.automationRun.create).not.toHaveBeenCalled();
    expect(auth0.findUserByEmail).not.toHaveBeenCalled();
  });

  it('loses the race cleanly: a concurrent execute that fails the atomic flip runs nothing', async () => {
    // Both requests read status dry_run, but only one wins the
    // dry_run → consumed updateMany. The loser must 409 without creating an
    // executing run or touching Auth0/JSM.
    primeDryRun();
    mockPrisma.automationRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup')
    ).rejects.toMatchObject({
      status: 409,
      code: 'DRY_RUN_ALREADY_EXECUTED',
    });
    expect(mockPrisma.automationRun.create).not.toHaveBeenCalled();
    expect(auth0.findUserByEmail).not.toHaveBeenCalled();
    expect(email.sendAutomationReport).not.toHaveBeenCalled();
  });
});

// Missed-fire detection: the July crons fire once a year on a single minute;
// if the container was down at fire time (or a run died mid-execution) the
// automation silently never happens. checkMissedJulyAutomations alerts IT at
// boot and on the daily cron tick.
describe('checkMissedJulyAutomations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.AUTOMATIONS_ENABLED = true;
    mockPrisma.automationRun.findFirst.mockResolvedValue(null);
    mockPrisma.automationRun.findMany.mockResolvedValue([]);
    email.sendMissedAutomationAlert.mockResolvedValue(undefined);
  });

  it('does nothing when AUTOMATIONS_ENABLED is false (dev/staging is not an incident)', async () => {
    envMock.AUTOMATIONS_ENABLED = false;

    await checkMissedJulyAutomations(new Date('2026-08-15T12:00:00Z'));

    expect(mockPrisma.automationRun.findFirst).not.toHaveBeenCalled();
    expect(email.sendMissedAutomationAlert).not.toHaveBeenCalled();
  });

  it('does not alert before the scheduled fire time of the just-started academic year', async () => {
    // 03:00 UTC on July 1: the new AY has started but neither cron has fired yet.
    await checkMissedJulyAutomations(new Date('2026-07-01T03:00:00Z'));

    expect(mockPrisma.automationRun.findFirst).not.toHaveBeenCalled();
    expect(email.sendMissedAutomationAlert).not.toHaveBeenCalled();
  });

  it('does not alert when a completed/partial run exists for the academic year', async () => {
    mockPrisma.automationRun.findFirst.mockResolvedValue({ id: 'run-ok' });

    await checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'));

    expect(email.sendMissedAutomationAlert).not.toHaveBeenCalled();
  });

  it('does not alert when a zero-action dry run exists (legitimate no-op year)', async () => {
    // The cron deliberately skips executeAutomation when the dry run has no
    // actions, so a no-op year leaves only a dry_run-status row.
    mockPrisma.automationRun.findMany.mockResolvedValue([{ result: { actions: [] } }]);

    await checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'));

    expect(email.sendMissedAutomationAlert).not.toHaveBeenCalled();
    expect(mockPrisma.automationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'dry_run' }),
      })
    );
  });

  it('a dry run WITH actions does not satisfy the check — execution was owed', async () => {
    mockPrisma.automationRun.findMany.mockResolvedValue([
      { result: { actions: [{ email: 'a@x.org', name: 'A', action: 'remove' }] } },
    ]);

    await checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'));

    expect(email.sendMissedAutomationAlert).toHaveBeenCalledTimes(2);
  });

  it('a consumed dry run with a stale executing row still alerts (crashed execution)', async () => {
    // Consumed means an execution started; only that execution's own row
    // reaching completed/partial satisfies the check. The query must filter
    // status dry_run — if it picked up other statuses, this zero-action
    // consumed row would wrongly suppress the alert.
    mockPrisma.automationRun.findMany.mockImplementation(
      async (args: { where: { status: unknown } }) =>
        args.where.status === 'dry_run' ? [] : [{ result: { actions: [] } }]
    );
    // Executing row exists but is older than the 6h TTL → invisible to the
    // cutoff-filtered in-flight query.
    mockPrisma.automationRun.findFirst.mockResolvedValue(null);

    await checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'));

    expect(email.sendMissedAutomationAlert).toHaveBeenCalledTimes(2);
  });

  it('alerts IT for each July automation with no completed run after its fire time', async () => {
    await checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'));

    expect(email.sendMissedAutomationAlert).toHaveBeenCalledTimes(2);
    const types = email.sendMissedAutomationAlert.mock.calls.map((c) => c[0].type);
    expect(types).toEqual(['end-of-year-cleanup', 'new-cohort-onboarding']);
    expect(email.sendMissedAutomationAlert.mock.calls[0][0].academicYear).toBe('2026-2027');
  });

  it('checks against the CURRENT academic year even months after July (UTC math)', async () => {
    // March 2027 belongs to AY 2026-2027, whose July fire dates are long past.
    await checkMissedJulyAutomations(new Date('2027-03-15T00:00:00Z'));

    expect(mockPrisma.automationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academicYear: '2026-2027' }),
      })
    );
    expect(email.sendMissedAutomationAlert).toHaveBeenCalledTimes(2);
  });

  it('treats a fresh executing run as in progress, not missed', async () => {
    mockPrisma.automationRun.findFirst.mockImplementation(
      async (args: { where: { status: unknown } }) =>
        args.where.status === 'executing' ? { id: 'run-live' } : null
    );

    await checkMissedJulyAutomations(new Date('2026-07-01T05:00:00Z'));

    expect(email.sendMissedAutomationAlert).not.toHaveBeenCalled();
  });

  it('treats a run stuck in executing beyond the 6h TTL as missed', async () => {
    // The in-flight query carries a startedAt > now-6h cutoff, so a wedged run
    // older than that is invisible to it — the database returns null and the
    // alert fires. Pin the cutoff so the TTL cannot silently regress.
    const now = new Date('2026-07-01T12:00:00Z');

    await checkMissedJulyAutomations(now);

    const executingQuery = mockPrisma.automationRun.findFirst.mock.calls.find(
      (c) => c[0].where.status === 'executing'
    );
    expect(executingQuery![0].where.startedAt).toEqual({
      gt: new Date('2026-07-01T06:00:00Z'),
    });
    expect(email.sendMissedAutomationAlert).toHaveBeenCalled();
  });

  it('only logs when the alert email itself fails', async () => {
    email.sendMissedAutomationAlert.mockRejectedValue(new Error('SES down'));

    await expect(
      checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'))
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Automation: failed to send missed-automation alert email'
    );
  });

  it('only logs when the run lookup itself fails (boot must never crash on this)', async () => {
    mockPrisma.automationRun.findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      checkMissedJulyAutomations(new Date('2026-07-03T12:00:00Z'))
    ).resolves.toBeUndefined();
    expect(email.sendMissedAutomationAlert).not.toHaveBeenCalled();
  });
});

// The daily bio-email dispatch previously only logger.error'd on failure —
// nobody was alerted while rows sat PENDING. The cron now counts consecutive
// failure DAYS in module state (single-instance design, see ARCHITECTURE.md)
// and emails IT on every 3rd one. A failure day is a dispatch that threw OR
// one that resolved with failed/deferred > 0 (dispatchPendingEmails catches
// per-message failures and resolves with counts, so a full SES/CiviCRM outage
// is a resolved run); only a clean day with processed > 0 resets the streak,
// and an idle day (processed 0) leaves it unchanged.
describe('bio-email dispatch consecutive-failure alerting', () => {
  const scheduleMock = vi.mocked(cron.schedule);

  const cleanRun = { processed: 2, sent: 2, skipped: 0, failed: 0, deferred: 0, reclaimed: 0 };
  const idleRun = { processed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0, reclaimed: 0 };

  function registerAndGetDailyCallback(): () => Promise<void> {
    envMock.APPOINTEE_EMAIL_CRON_ENABLED = true;
    // Keep the July crons (and the piggybacked missed-fire check) inert.
    envMock.AUTOMATIONS_ENABLED = false;
    registerCronJobs();
    const call = scheduleMock.mock.calls.find((c) => c[0] === '0 9 * * *');
    return call![1] as () => Promise<void>;
  }

  /** Zeroes the module-level streak left by a previous test via a clean run. */
  async function resetStreak(tick: () => Promise<void>): Promise<void> {
    appointeeEmail.dispatchPendingEmails.mockResolvedValueOnce(cleanRun);
    await tick();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    email.sendDailyDispatchFailureAlert.mockResolvedValue(undefined);
  });

  it('alerts on the 3rd consecutive failure, resets on a clean run, and re-alerts every 3rd', async () => {
    const tick = registerAndGetDailyCallback();
    const fail = () => {
      appointeeEmail.dispatchPendingEmails.mockRejectedValueOnce(new Error('SES exploded'));
      return tick();
    };

    await fail();
    await fail();
    expect(email.sendDailyDispatchFailureAlert).not.toHaveBeenCalled();

    await fail();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(1);
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledWith({
      consecutiveFailures: 3,
      lastError: 'SES exploded',
    });

    // Days 4 and 5 stay quiet; day 6 nudges again.
    await fail();
    await fail();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(1);
    await fail();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(2);
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenLastCalledWith({
      consecutiveFailures: 6,
      lastError: 'SES exploded',
    });

    // A clean run resets the streak: two fresh failures do not alert...
    await resetStreak(tick);
    await fail();
    await fail();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(2);
    // ...and the 3rd does, with the counter starting over.
    await fail();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(3);
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenLastCalledWith({
      consecutiveFailures: 3,
      lastError: 'SES exploded',
    });
  });

  it('a dispatch that RESOLVES with failed > 0 counts toward the streak — the alert carries the counts', async () => {
    // Regression: dispatchPendingEmails catches per-message failures and
    // resolves, so a full SES outage used to reset the streak daily and the
    // alert never fired for exactly the failures it exists to detect.
    const tick = registerAndGetDailyCallback();
    await resetStreak(tick);
    const counts = { processed: 3, sent: 0, skipped: 0, failed: 3, deferred: 0, reclaimed: 0 };
    const failResolved = () => {
      appointeeEmail.dispatchPendingEmails.mockResolvedValueOnce(counts);
      return tick();
    };

    await failResolved();
    await failResolved();
    expect(email.sendDailyDispatchFailureAlert).not.toHaveBeenCalled();

    await failResolved();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(1);
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledWith({
      consecutiveFailures: 3,
      lastRunCounts: counts,
    });
  });

  it('deferred-only days and thrown errors share one streak', async () => {
    const tick = registerAndGetDailyCallback();
    await resetStreak(tick);

    appointeeEmail.dispatchPendingEmails.mockResolvedValueOnce({
      processed: 2, sent: 0, skipped: 0, failed: 0, deferred: 2, reclaimed: 0,
    });
    await tick();
    appointeeEmail.dispatchPendingEmails.mockRejectedValueOnce(new Error('SES exploded'));
    await tick();
    expect(email.sendDailyDispatchFailureAlert).not.toHaveBeenCalled();

    const lastCounts = { processed: 1, sent: 0, skipped: 0, failed: 1, deferred: 0, reclaimed: 0 };
    appointeeEmail.dispatchPendingEmails.mockResolvedValueOnce(lastCounts);
    await tick();
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(1);
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledWith({
      consecutiveFailures: 3,
      lastRunCounts: lastCounts,
    });
  });

  it('an idle day (processed 0) neither resets nor extends the streak', async () => {
    const tick = registerAndGetDailyCallback();
    await resetStreak(tick);
    const fail = () => {
      appointeeEmail.dispatchPendingEmails.mockRejectedValueOnce(new Error('SES exploded'));
      return tick();
    };
    const idle = () => {
      appointeeEmail.dispatchPendingEmails.mockResolvedValueOnce(idleRun);
      return tick();
    };

    await fail();
    await fail();
    await idle(); // no dispatch evidence either way — streak stays at 2
    expect(email.sendDailyDispatchFailureAlert).not.toHaveBeenCalled();

    await fail(); // 3rd actual failure day
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(1);
    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 3 })
    );
  });

  it('an alert-send failure only logs — the cron callback never throws', async () => {
    const tick = registerAndGetDailyCallback();
    await resetStreak(tick);

    email.sendDailyDispatchFailureAlert.mockRejectedValue(new Error('alert channel down'));
    appointeeEmail.dispatchPendingEmails.mockRejectedValue(new Error('dispatch broken'));

    await expect(tick()).resolves.toBeUndefined();
    await expect(tick()).resolves.toBeUndefined();
    await expect(tick()).resolves.toBeUndefined(); // 3rd failure triggers the failing alert

    expect(email.sendDailyDispatchFailureAlert).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Automation: failed to send bio-email dispatch failure alert'
    );
  });
});
