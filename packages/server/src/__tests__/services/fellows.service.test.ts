import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../env.js', () => ({
  env: {
    AUTH0_FELLOWS_ROLE_ID: 'test-role',
  },
  isDevMode: false,
}));

vi.mock('../../services/civicrm.service.js', () => ({
  getFellowsWithContacts: vi.fn(),
  getEmailsForContacts: vi.fn(),
}));

vi.mock('../../services/auth0.service.js', () => ({
  listUsersByRole: vi.fn(),
}));

vi.mock('../../services/appointee-email.service.js', () => ({
  getEmailStatusForContacts: vi.fn(),
  // Pin the "current" academic year so isCurrent flags are deterministic.
  currentAndNextAcademicYears: vi.fn(() => ['2025-2026', '2026-2027']),
}));

const { mockInfo } = vi.hoisted(() => ({ mockInfo: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: mockInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getFellowsDashboard } from '../../services/fellows.service.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as auth0Service from '../../services/auth0.service.js';
import * as appointeeEmailService from '../../services/appointee-email.service.js';

const mockCivicrm = vi.mocked(civicrmService);
const mockAuth0 = vi.mocked(auth0Service);
const mockAppointee = vi.mocked(appointeeEmailService);

// Synthetic fellowship row from CiviCRM. Uses mid-academic-year dates so the
// default pinned academic year ('2025-2026') classifies it as "current".
function fellow(overrides: Partial<{
  contactId: number;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl: string;
  appointment: string;
  fellowship: string;
  fellowshipId: number;
  startDate: string;
  endDate: string;
  fellowshipAccepted: boolean;
}> = {}) {
  return {
    contactId: 1,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@x.com',
    imageUrl: undefined,
    appointment: 'Fellow',
    fellowship: 'Test Fellow',
    fellowshipId: 1,
    startDate: '2025-09-01',
    endDate: '2026-06-30',
    fellowshipAccepted: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockInfo.mockReset();
  // Default mocks: no users, no fellows, no bio-email events, no email entity rows.
  mockAuth0.listUsersByRole.mockResolvedValue([]);
  mockCivicrm.getFellowsWithContacts.mockResolvedValue([]);
  mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
  mockAppointee.getEmailStatusForContacts.mockResolvedValue(new Map());
  mockAppointee.currentAndNextAcademicYears.mockReturnValue(['2025-2026', '2026-2027']);
});

describe('getFellowsDashboard — empty state', () => {
  it('returns empty fellow list and zeroed summary', async () => {
    const result = await getFellowsDashboard();

    expect(result.fellows).toEqual([]);
    expect(result.summary).toEqual({
      total: 0,
      noAccount: 0,
      active: 0,
      activeDifferentEmail: 0,
      needsReview: 0,
    });
  });
});

describe('getFellowsDashboard — ladder integration', () => {
  it('active via primary-email: fellow whose CiviCRM email exists in Auth0', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, email: 'sophie@x.com', firstName: 'Sophie', lastName: 'Laurent' }),
    ]);
    // Post-on_hold-fallback-removal: Email.get must return the primary for it
    // to be matched. The fellow-list row's email is no longer used as fallback.
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[1, { primary: 'sophie@x.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|sophie', email: 'sophie@x.com', civicrmId: '1' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows).toHaveLength(1);
    expect(result.fellows[0].status).toBe('active');
    expect(result.fellows[0].matchedVia).toBe('primary-email');
    expect(result.fellows[0].matched?.email).toBe('sophie@x.com');
    expect(result.fellows[0].civicrmIdStatus).toBe('ok');
    expect(result.summary).toEqual({
      total: 1,
      noAccount: 0,
      active: 1,
      activeDifferentEmail: 0,
      needsReview: 0,
    });
  });

  it('active-different-email via civicrm_id: returning fellow with changed email', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 42, email: 'new@x.com', firstName: 'Thomas', lastName: 'Müller' }),
    ]);
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|thomas', email: 'old@x.com', civicrmId: '42' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('active-different-email');
    expect(result.fellows[0].matchedVia).toBe('civicrm-id');
    expect(result.fellows[0].matched?.email).toBe('old@x.com');
    expect(result.fellows[0].civicrmIdStatus).toBe('ok');
    expect(result.summary.activeDifferentEmail).toBe(1);
    expect(result.summary.active).toBe(0);
  });

  it('active-different-email via secondary-email: CiviCRM has old email as secondary', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 50, email: 'new@x.com', firstName: 'Isabella', lastName: 'Ferrari' }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[50, { primary: 'new@x.com', secondaries: ['old@y.com'] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|isabella', email: 'old@y.com' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('active-different-email');
    expect(result.fellows[0].matchedVia).toBe('secondary-email');
    expect(result.fellows[0].matchedViaEmail).toBe('old@y.com');
  });

  it('needs-review with candidates populated on the entry', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 99, email: 'maria@x.com', firstName: 'Maria', lastName: 'Rossi' }),
    ]);
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|maria1', email: 'm1@old.com', name: 'Maria Rossi' },
      { user_id: 'auth0|maria2', email: 'm2@old.com', name: 'MARIA ROSSI' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('needs-review');
    expect(result.fellows[0].reason).toBe('name-collision');
    expect(result.fellows[0].candidates).toHaveLength(2);
    expect(result.summary.needsReview).toBe(1);
  });

  it('no-account: no ladder match', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 200, email: 'unknown@x.com', firstName: 'Unknown', lastName: 'Person' }),
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('no-account');
    expect(result.fellows[0].matched).toBeUndefined();
    expect(result.fellows[0].civicrmIdStatus).toBe('n/a');
    expect(result.summary.noAccount).toBe(1);
  });

  it('civicrmIdStatus "missing" when active but Auth0 user lacks civicrm_id metadata', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 300, email: 'elena@x.com', firstName: 'Elena', lastName: 'Petrova' }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[300, { primary: 'elena@x.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|elena', email: 'elena@x.com' /* no civicrmId */ },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('active');
    expect(result.fellows[0].civicrmIdStatus).toBe('missing');
  });
});

describe('getFellowsDashboard — dedup by contactId', () => {
  it('collapses multiple fellowships per contact into one row with the latest startDate', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({
        contactId: 1,
        fellowshipId: 1,
        startDate: '2023-09-01',
        endDate: '2024-06-30',
        fellowship: 'Old Fellowship',
      }),
      fellow({
        contactId: 1,
        fellowshipId: 2,
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        fellowship: 'New Fellowship',
      }),
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows).toHaveLength(1);
    // Latest fellowship wins.
    expect(result.fellows[0].fellowship).toBe('New Fellowship');
  });
});

describe('getFellowsDashboard — sort order', () => {
  it('sorts by appointment asc, then lastName asc', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, appointment: 'Visiting Professor', lastName: 'Zimmerman' }),
      fellow({ contactId: 2, appointment: 'Fellow', lastName: 'Adams' }),
      fellow({ contactId: 3, appointment: 'Visiting Professor', lastName: 'Anderson' }),
      fellow({ contactId: 4, appointment: 'Fellow', lastName: 'Brown' }),
    ]);

    const result = await getFellowsDashboard();

    // Fellow (A*) before Visiting Professor (V*), alphabetical within each group.
    expect(result.fellows.map((f) => `${f.appointment}/${f.lastName}`)).toEqual([
      'Fellow/Adams',
      'Fellow/Brown',
      'Visiting Professor/Anderson',
      'Visiting Professor/Zimmerman',
    ]);
  });
});

describe('getFellowsDashboard — observability log', () => {
  it('emits a structured match summary with counts per status and tier', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, email: 'a@x.com' }),
      fellow({ contactId: 2, email: 'b@x.com' }),
      fellow({ contactId: 3, email: 'c@x.com' }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map([
      [1, { primary: 'a@x.com', secondaries: [] }],
      [2, { primary: 'b@x.com', secondaries: [] }],
      [3, { primary: 'c@x.com', secondaries: [] }],
    ]));
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|1', email: 'a@x.com' }, // tier 1 hit
      { user_id: 'auth0|2', email: 'other@x.com', civicrmId: '2' }, // tier 2 hit
      // contact 3 has no match
    ]);

    await getFellowsDashboard();

    // Find the match-summary log call (logger.info is called for other reasons too).
    const summaryCall = mockInfo.mock.calls.find(
      (c) => c[0] && typeof c[0] === 'object' && c[0].event === 'fellows_dashboard_match_summary'
    );
    expect(summaryCall).toBeDefined();
    const payload = summaryCall![0];
    expect(payload.totalFellows).toBe(3);
    expect(payload.byStatus.active).toBe(1);
    expect(payload.byStatus['active-different-email']).toBe(1);
    expect(payload.byStatus['no-account']).toBe(1);
    expect(payload.byMatchedVia['primary-email']).toBe(1);
    expect(payload.byMatchedVia['civicrm-id']).toBe(1);
  });
});

describe('getFellowsDashboard — academic year filter', () => {
  it('filters out fellowships not matching the requested year', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, startDate: '2025-09-01', endDate: '2026-06-30' }), // 2025-2026
      fellow({ contactId: 2, startDate: '2024-09-01', endDate: '2025-06-30' }), // 2024-2025
    ]);

    const result = await getFellowsDashboard('2024-2025');

    expect(result.fellows).toHaveLength(1);
    expect(result.fellows[0].civicrmId).toBe(2);
  });

  it('returns all academic years regardless of filter, sorted descending', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, startDate: '2025-09-01', endDate: '2026-06-30' }),
      fellow({ contactId: 2, startDate: '2023-09-01', endDate: '2024-06-30' }),
      fellow({ contactId: 3, startDate: '2024-09-01', endDate: '2025-06-30' }),
    ]);

    const result = await getFellowsDashboard();

    expect(result.academicYears).toEqual(['2025-2026', '2024-2025', '2023-2024']);
  });
});
