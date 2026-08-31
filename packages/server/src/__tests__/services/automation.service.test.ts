import { describe, it, expect, vi, beforeEach } from 'vitest';

// Drives executeAutomation through the end-of-year executor to pin the run
// status derivation: an all-failure run must report `failed`, a mixed run
// `partial`, a clean run `completed`. The old `errors === processed` test
// mis-reported an all-failure run (5 errors / 0 processed → 5 === 0 → false) as
// `partial`; status now compares errors to the `attempted` count.

const { mockPrisma, auth0, jsm, email, envMock } = vi.hoisted(() => ({
  mockPrisma: {
    automationRun: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
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
  email: { sendAutomationReport: vi.fn() },
  envMock: {
    NODE_ENV: 'production',
    AUTH0_FELLOWS_CURRENT_ROLE_ID: 'rol_current',
    AUTOMATIONS_ENABLED: false,
    APPOINTEE_EMAIL_CRON_ENABLED: false,
  },
}));

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../services/auth0.service.js', () => auth0);
vi.mock('../../services/atlassian-jsm.service.js', () => jsm);
vi.mock('../../services/civicrm.service.js', () => ({ getFellowsWithContacts: vi.fn() }));
vi.mock('../../services/email.service.js', () => email);
vi.mock('../../services/appointee-email.service.js', () => ({ dispatchPendingEmails: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../env.js', () => ({ env: envMock, isDevMode: false }));

import cron from 'node-cron';
import { executeAutomation, registerCronJobs } from '../../services/automation.service.js';

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
    jsm.removeUserFromCurrentAppointees.mockResolvedValue({ site1: false, site2: false });

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('failed');
    expect(lastUpdateStatus()).toBe('failed');
  });

  it('reports PARTIAL when some succeed and some fail', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees
      .mockResolvedValueOnce({ site1: true, site2: true }) // a@x.org succeeds
      .mockResolvedValue({ site1: false, site2: false }); // the rest fail

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('partial');
    expect(lastUpdateStatus()).toBe('partial');
  });

  it('reports COMPLETED when every removal succeeds', async () => {
    primeDryRun();
    jsm.removeUserFromCurrentAppointees.mockResolvedValue({ site1: true, site2: true });

    const result = await executeAutomation('dry-1', 'admin:test', 'end-of-year-cleanup');

    expect(result.status).toBe('completed');
    expect(lastUpdateStatus()).toBe('completed');
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
