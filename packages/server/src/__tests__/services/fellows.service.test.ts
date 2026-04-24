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

describe('getFellowsDashboard — duplicate-civicrm-contact pre-flight', () => {
  it('short-circuits to needs-review when a fellow email is shared across 2+ CiviCRM contacts', async () => {
    // Both contacts have 'shared@x.com' on file. Without the pre-flight,
    // reconcile() would pick whichever Auth0 user happened to be under
    // 'shared@x.com' for one of them.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, firstName: 'Alpha', lastName: 'One', email: 'shared@x.com' }),
      fellow({ contactId: 2, firstName: 'Beta', lastName: 'Two', email: 'other@x.com' }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map([
      [1, { primary: 'shared@x.com', secondaries: [] }],
      [2, { primary: 'other@x.com', secondaries: ['shared@x.com'] }], // duplicate
    ]));
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|x', email: 'shared@x.com' },
    ]);

    const result = await getFellowsDashboard();

    // Both fellows surface as needs-review/duplicate-civicrm-contact,
    // because each carries an email that appears on a different contact.
    expect(result.fellows).toHaveLength(2);
    for (const f of result.fellows) {
      expect(f.status).toBe('needs-review');
      expect(f.reason).toBe('duplicate-civicrm-contact');
    }
  });

  it('does not false-positive when the same email appears on the SAME contact twice', async () => {
    // primary and a secondary happening to be the same address — already
    // handled by getEmailsForContacts' dedup, but belt-and-suspenders.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, email: 'only@x.com' }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[1, { primary: 'only@x.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|x', email: 'only@x.com' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('active');
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
    // Call WITH a filter to prove the claim: even when the year filter
    // narrows `fellows`, the `academicYears` dropdown still lists every
    // year present in the raw CiviCRM data so staff can switch.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, startDate: '2025-09-01', endDate: '2026-06-30' }),
      fellow({ contactId: 2, startDate: '2023-09-01', endDate: '2024-06-30' }),
      fellow({ contactId: 3, startDate: '2024-09-01', endDate: '2025-06-30' }),
    ]);

    const result = await getFellowsDashboard('2024-2025');

    expect(result.academicYears).toEqual(['2025-2026', '2024-2025', '2023-2024']);
    // Filter still works: only the 2024-2025 fellowship (contactId 3) in fellows.
    expect(result.fellows).toHaveLength(1);
    expect(result.fellows[0].civicrmId).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Dashboard composition: appointeeStatus + vitIdInvitation summary. Covers
// the new fields added alongside the Manage Appointees redesign.
// ───────────────────────────────────────────────────────────────────────

describe('getFellowsDashboard — appointeeStatus composition', () => {
  it('a no-VIT-ID + accepted fellowship row derives appointeeStatus="accepted" and shows canManuallySend for VIT invitation', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, fellowshipAccepted: true }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
    mockAuth0.listUsersByRole.mockResolvedValue([]); // no VIT ID

    const result = await getFellowsDashboard();

    expect(result.fellows[0].appointeeStatus).toBe('accepted');
    // VIT invitation should be offerable.
    expect(result.fellows[0].vitIdInvitation.canManuallySend).toBe(true);
    // Bio email should NOT be offerable — requires a VIT ID first.
    expect(result.fellows[0].bioEmail.canManuallySend).toBe(false);
  });

  it('a contact WITH a VIT ID and accepted fellowship derives appointeeStatus="vit-id-claimed" and shows canManuallySend for bio only', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, email: 'sofia@x.com', fellowshipAccepted: true }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[1, { primary: 'sofia@x.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|sofia', email: 'sofia@x.com', civicrmId: '1' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].appointeeStatus).toBe('vit-id-claimed');
    // Inverted: VIT invitation off, bio on.
    expect(result.fellows[0].vitIdInvitation.canManuallySend).toBe(false);
    expect(result.fellows[0].bioEmail.canManuallySend).toBe(true);
  });

  it('a non-accepted fellowship (fellowshipAccepted=false) derives appointeeStatus="nominated" and suppresses BOTH send buttons', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, fellowshipAccepted: false }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
    mockAuth0.listUsersByRole.mockResolvedValue([]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].appointeeStatus).toBe('nominated');
    expect(result.fellows[0].vitIdInvitation.canManuallySend).toBe(false);
    expect(result.fellows[0].bioEmail.canManuallySend).toBe(false);
  });

  it('needs-review match-ladder outcome disables BOTH send buttons even when the lifecycle would otherwise allow them', async () => {
    // Two Auth0 users with the same normalized name — ladder tier 4 collision.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({
        contactId: 1,
        firstName: 'Maria',
        lastName: 'Rossi',
        fellowshipAccepted: true,
      }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|a', email: 'a@x.com', name: 'Maria Rossi' },
      { user_id: 'auth0|b', email: 'b@x.com', name: 'MARIA ROSSI' },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('needs-review');
    // Both send buttons must be suppressed so Angela can't mis-send before
    // resolving the duplicate. This is the defense-in-depth rail that lives
    // at the dashboard level (the server route also refuses).
    expect(result.fellows[0].vitIdInvitation.canManuallySend).toBe(false);
    expect(result.fellows[0].bioEmail.canManuallySend).toBe(false);
  });

  it('active-different-email (returning fellow, email changed) is treated as hasVitId for lifecycle', async () => {
    // The contact's current CiviCRM email is new; the old Auth0 user is still
    // reachable via app_metadata.civicrm_id. Lifecycle collapses this into
    // "vit-id-claimed" exactly like a straight 'active' match.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({
        contactId: 1,
        email: 't.mueller.new@x.com',
        fellowshipAccepted: true,
      }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[1, { primary: 't.mueller.new@x.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      {
        user_id: 'auth0|thomas',
        email: 't.mueller@old.com',
        civicrmId: '1',
      },
    ]);

    const result = await getFellowsDashboard();

    expect(result.fellows[0].status).toBe('active-different-email');
    expect(result.fellows[0].appointeeStatus).toBe('vit-id-claimed');
    expect(result.fellows[0].vitIdInvitation.canManuallySend).toBe(false);
    expect(result.fellows[0].bioEmail.canManuallySend).toBe(true);
  });

  it('widens the email-status query scope to ALL academic years present in the data (codex finding #2)', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, startDate: '2024-09-01', endDate: '2025-06-30' }),
      fellow({ contactId: 2, startDate: '2025-09-01', endDate: '2026-06-30' }),
      fellow({ contactId: 3, startDate: '2026-09-01', endDate: '2027-06-30' }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
    mockAuth0.listUsersByRole.mockResolvedValue([]);

    await getFellowsDashboard();

    // Before the codex-finding-#2 fix, this was hardcoded to [currentAy, nextAy]
    // = ['2025-2026', '2026-2027'] and the 2024-2025 row's bio status pill
    // silently showed blank even if we had a SENT event for it.
    const call = mockAppointee.getEmailStatusForContacts.mock.calls[0];
    const yearsArg = call[1] as string[];
    expect(yearsArg).toEqual(
      expect.arrayContaining(['2024-2025', '2025-2026', '2026-2027'])
    );
  });

  it('looks up email events against the TARGET-year fellowship, not the display (latest-starting) fellowship', async () => {
    // Returning-fellow scenario: a contact has a current-year fellowship
    // (2025-2026, already enrolled — bio email was SENT under its
    // fellowshipId) AND an upcoming accepted fellowship (2026-2027, display
    // row because it starts later). The dashboard dedupes on latest-start
    // so the display row is 2026-2027; but the current-year bio email is
    // keyed under the 2025-2026 fellowship.
    //
    // If the lookup used displayFellowshipId (the 2026-2027 one), the
    // dashboard would show "bio email: none" for a contact who actually
    // received it. This test asserts the lookup uses the target-year
    // fellowshipId so the SENT event surfaces correctly.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      // 2025-2026: current, fellowshipId=100, bio email already sent
      fellow({
        contactId: 1,
        fellowshipId: 100,
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        fellowshipAccepted: true,
      }),
      // 2026-2027: upcoming accepted, fellowshipId=200, latest-starting
      fellow({
        contactId: 1,
        fellowshipId: 200,
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|u', email: 'test@x.com', civicrmId: '1' },
    ]);

    // Bio email event stored under fellowshipId=100 (the current-year one).
    // If the code looks up by displayFellowshipId (200), this event
    // SILENTLY MISSES and the row shows "bio email: none".
    mockAppointee.getEmailStatusForContacts.mockResolvedValue(
      new Map([
        [
          '100:BIO_PROJECT_DESCRIPTION',
          {
            status: 'SENT' as any,
            sentAt: new Date('2025-10-01'),
            academicYear: '2025-2026',
            emailType: 'BIO_PROJECT_DESCRIPTION' as any,
            fellowshipId: 100,
          },
        ],
      ])
    );

    const result = await getFellowsDashboard();

    expect(result.fellows).toHaveLength(1);
    // The bio email must be visible as SENT on the display row, proving the
    // lookup used the 2025-2026 (current) fellowshipId, not the 2026-2027
    // (display) one.
    expect(result.fellows[0].bioEmail.status).toBe('sent');
  });

  it('shows historical email status when filtering to a past academic year without enabling manual send', async () => {
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({
        contactId: 1,
        fellowshipId: 90,
        startDate: '2024-09-01',
        endDate: '2025-06-30',
        fellowshipAccepted: true,
      }),
      fellow({
        contactId: 1,
        fellowshipId: 100,
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        fellowshipAccepted: true,
      }),
    ]);
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[1, { primary: 'test@x.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|u', email: 'test@x.com', civicrmId: '1' },
    ]);
    mockAppointee.getEmailStatusForContacts.mockResolvedValue(
      new Map([
        [
          '90:BIO_PROJECT_DESCRIPTION',
          {
            status: 'SENT' as any,
            sentAt: new Date('2024-10-01'),
            academicYear: '2024-2025',
            emailType: 'BIO_PROJECT_DESCRIPTION' as any,
            fellowshipId: 90,
          },
        ],
      ])
    );

    const result = await getFellowsDashboard('2024-2025');

    expect(result.fellows).toHaveLength(1);
    expect(result.fellows[0].fellowshipYear).toBe('2024-2025');
    expect(result.fellows[0].bioEmail.status).toBe('sent');
    expect(result.fellows[0].bioEmail.canManuallySend).toBe(false);
  });

  it('exposes appointeeStatus and vitIdInvitation on every row (never undefined)', async () => {
    // Guard: if a code path ever drops one of these from the assembly loop,
    // the UI blows up with "Cannot read property 'status' of undefined" on
    // AppointeeStatusBadge. Every row must have both fields.
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      fellow({ contactId: 1, fellowshipAccepted: true }),
      fellow({ contactId: 2, fellowshipAccepted: false }),
      fellow({
        contactId: 3,
        firstName: 'Dup',
        lastName: 'Contact',
        email: 'dup@x.com',
        fellowshipAccepted: true,
      }),
    ]);
    // Seed a cross-contact duplicate — that row goes through the early
    // needs-review short-circuit, which must also emit both new fields.
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([
        [3, { primary: 'shared@x.com', secondaries: [] }],
        [4, { primary: 'shared@x.com', secondaries: [] }],
      ])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([]);

    const result = await getFellowsDashboard();

    for (const f of result.fellows) {
      expect(f.appointeeStatus).toBeDefined();
      expect(f.vitIdInvitation).toBeDefined();
      expect(f.vitIdInvitation.canManuallySend).toEqual(expect.any(Boolean));
    }
  });
});
