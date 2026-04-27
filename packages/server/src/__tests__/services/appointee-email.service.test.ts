import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    appointeeEmailEvent: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/civicrm.service.js', () => ({
  getContactById: vi.fn(),
  getFellowships: vi.fn(),
  getEmailsForContacts: vi.fn(),
}));

vi.mock('../../services/auth0.service.js', () => ({
  findUserByEmail: vi.fn(),
  listUsersByRole: vi.fn(),
}));

vi.mock('../../services/email.service.js', () => ({
  sendBioProjectDescriptionEmail: vi.fn(),
  sendVitIdInvitationEmail: vi.fn(),
}));

vi.mock('../../env.js', () => ({
  env: {
    APPOINTEE_EMAIL_REDIRECT_TO: '',
    APPOINTEE_EMAIL_BCC: '',
    APPOINTEE_EMAIL_CRON_ENABLED: false,
    AUTH0_FELLOWS_ROLE_ID: 'test-role',
  },
  isDevMode: false,
}));

import {
  enqueueBioEmail,
  dispatchOne,
  dispatchPendingEmails,
  evaluateBioEmailEligibility,
  evaluateVitIdInvitationEligibility,
  sendBioEmailManually,
  sendVitIdInvitationManually,
  getEmailStatusForContacts,
  currentAndNextAcademicYears,
} from '../../services/appointee-email.service.js';
import { prisma } from '../../lib/prisma.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as auth0Service from '../../services/auth0.service.js';
import * as emailService from '../../services/email.service.js';

const mockPrisma = vi.mocked(prisma, true);
const mockCivicrm = vi.mocked(civicrmService);
const mockAuth0 = vi.mocked(auth0Service);
const mockEmail = vi.mocked(emailService);

// Most existing tests assume the contact has a VIT ID (Auth0 user). Install
// default stubs in beforeEach so each test only overrides when it's
// specifically testing the no-VIT-ID path.
//
// After the match-ladder refactor, the "has VIT ID" check resolves via
// listUsersByRole() + getEmailsForContacts(). The default match is via
// tier 2 (civicrm_id), not tier 1 (primary email):
//   - mockCivicrm.getEmailsForContacts returns new Map(), so the ladder
//     sees primaryEmail = null and skips tier 1 entirely.
//   - mockAuth0.listUsersByRole returns one user with civicrmId: '1', so
//     tier 2 matches whenever the test contact's id is 1.
//   - The result: reconcile() returns 'active-different-email' via
//     civicrm-id for contact id 1, which satisfies checkHasVitIdViaLadder.
//
// Stubs installed: mockAuth0.findUserByEmail (legacy, still referenced by a
// few unchanged tests), mockAuth0.listUsersByRole, mockCivicrm.getEmailsForContacts.
//
// Tests simulating "no VIT ID" override mockAuth0.listUsersByRole with an
// empty array so neither tier 1 nor tier 2 can hit and reconcile() returns
// 'no-account'.
//
// We use resetAllMocks (not clearAllMocks) so per-test mockResolvedValue /
// mockRejectedValue stubs do not leak into subsequent tests via the shared
// mocked modules above. The defaults are re-installed here on every iteration.
beforeEach(() => {
  vi.resetAllMocks();
  mockAuth0.findUserByEmail.mockResolvedValue({
    user_id: 'auth0|default',
    email: 'default@example.com',
    name: 'Default User',
  });
  mockAuth0.listUsersByRole.mockResolvedValue([
    {
      user_id: 'auth0|default',
      email: 'default@example.com',
      name: 'Default User',
      civicrmId: '1',
    },
  ]);
  // Empty map = ladder sees primaryEmail=null (tier 1 skipped). Tier 2 is
  // the one that resolves the default match via the civicrmId above.
  mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
});

describe('currentAndNextAcademicYears', () => {
  it('computes [current, next] labels in mid-academic year', () => {
    const result = currentAndNextAcademicYears(new Date('2026-02-15'));
    expect(result).toEqual(['2025-2026', '2026-2027']);
  });

  it('computes [current, next] labels just after July 1', () => {
    const result = currentAndNextAcademicYears(new Date('2026-07-15'));
    expect(result).toEqual(['2026-2027', '2027-2028']);
  });
});

describe('enqueueBioEmail', () => {
  it('creates a new PENDING event with 24h delay when none exists', async () => {
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: 'evt_new', status: 'PENDING', ...args.data })
    );

    const before = Date.now();
    const result = await enqueueBioEmail({
      contactId: 100,
      academicYear: '2026-2027',
      fellowshipId: 7001,
      triggeredBy: 'claim_auto',
    });

    expect(result.created).toBe(true);
    expect(result.eventId).toBe('evt_new');
    expect(result.status).toBe('PENDING');

    const createCall = (mockPrisma.appointeeEmailEvent.create as any).mock.calls[0][0];
    expect(createCall.data.contactId).toBe(100);
    expect(createCall.data.academicYear).toBe('2026-2027');
    expect(createCall.data.fellowshipId).toBe(7001);
    expect(createCall.data.triggeredBy).toBe('claim_auto');
    expect(createCall.data.emailType).toBe('BIO_PROJECT_DESCRIPTION');
    const deltaMs = createCall.data.sendAfter.getTime() - before;
    // Roughly 24h ± small test overhead
    expect(deltaMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('respects delayHours: 0 for the manual path', async () => {
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: 'evt_now', status: 'PENDING', ...args.data })
    );

    const before = Date.now();
    await enqueueBioEmail({
      contactId: 200,
      academicYear: '2026-2027',
      fellowshipId: 7002,
      triggeredBy: 'admin_manual:user-1',
      delayHours: 0,
    });

    const createCall = (mockPrisma.appointeeEmailEvent.create as any).mock.calls[0][0];
    const delta = createCall.data.sendAfter.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(5_000); // sub-5s
  });

  it('is idempotent: returns the existing event without creating a duplicate', async () => {
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue({
      id: 'evt_existing',
      status: 'PENDING',
    });

    const result = await enqueueBioEmail({
      contactId: 300,
      academicYear: '2026-2027',
      fellowshipId: 7003,
      triggeredBy: 'claim_auto',
    });

    expect(result.created).toBe(false);
    expect(result.eventId).toBe('evt_existing');
    expect(mockPrisma.appointeeEmailEvent.create).not.toHaveBeenCalled();
  });

  it('handles P2002 race: re-fetches the winner row and returns created:false', async () => {
    // Two concurrent workers both see findUnique=null, then the loser's
    // create() fails with P2002 because the winner beat it to the unique
    // index. The loser must fall back to returning the winner's row.
    (mockPrisma.appointeeEmailEvent.findFirst as any)
      .mockResolvedValueOnce(null) // initial existence check
      .mockResolvedValueOnce({ id: 'evt_winner', status: 'PENDING' }); // post-P2002 re-fetch
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint violation',
      { code: 'P2002', clientVersion: 'test' }
    );
    (mockPrisma.appointeeEmailEvent.create as any).mockRejectedValue(p2002);

    const result = await enqueueBioEmail({
      contactId: 400,
      academicYear: '2026-2027',
      fellowshipId: 7004,
      triggeredBy: 'claim_auto',
    });

    expect(result.created).toBe(false);
    expect(result.eventId).toBe('evt_winner');
    expect(result.status).toBe('PENDING');
  });

  it('re-throws non-P2002 Prisma errors', async () => {
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    const other = new Prisma.PrismaClientKnownRequestError('nope', {
      code: 'P2025',
      clientVersion: 'test',
    });
    (mockPrisma.appointeeEmailEvent.create as any).mockRejectedValue(other);

    await expect(
      enqueueBioEmail({
        contactId: 500,
        academicYear: '2026-2027',
        fellowshipId: 7005,
        triggeredBy: 'claim_auto',
      })
    ).rejects.toBe(other);
  });
});

describe('evaluateBioEmailEligibility', () => {
  it('returns no_matching_fellowship when the contact does not exist', async () => {
    mockCivicrm.getContactById.mockResolvedValue(null);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toEqual({ eligible: false, reason: 'no_matching_fellowship' });
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns no_primary_email when contact exists but has no email', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: '',
    });

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toEqual({ eligible: false, reason: 'no_primary_email' });
  });

  it('returns eligible when returning fellow has VIT ID under different email (civicrm_id tier)', async () => {
    // The contact's primary email is new, but Auth0 has the user under an old
    // email with app_metadata.civicrm_id = 1. The ladder should still say
    // "has VIT ID" so the bio email can send.
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Returning',
      lastName: 'Fellow',
      email: 'new@x.com',
    });
    mockAuth0.listUsersByRole.mockResolvedValue([
      {
        user_id: 'auth0|returning',
        email: 'old@x.com',
        name: 'Returning Fellow',
        civicrmId: '1',
      },
    ]);
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toMatchObject({
      eligible: true,
      email: 'new@x.com',
      firstName: 'Returning',
      fellowshipId: 10,
    });
  });

  it('returns no_vit_id when ladder resolves to needs-review (refuses to send to ambiguous target)', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Maria',
      lastName: 'Rossi',
      email: 'new@x.com',
    });
    // Ladder fails all deterministic tiers but hits a name-collision on tier 4.
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|maria1', email: 'maria1@old.com', name: 'Maria Rossi' },
      { user_id: 'auth0|maria2', email: 'maria2@old.com', name: 'MARIA ROSSI' },
    ]);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toEqual({ eligible: false, reason: 'no_vit_id' });
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns no_vit_id when contact has an email but no Auth0 user exists', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'novitid@example.com',
    });
    // Post-ladder: override the default (one-user) Auth0 list with an empty
    // list so the match ladder resolves to 'no-account'.
    mockAuth0.listUsersByRole.mockResolvedValue([]);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toEqual({ eligible: false, reason: 'no_vit_id' });
    // Must short-circuit before hitting CiviCRM fellowships.
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns fellowship_not_accepted when only an un-accepted upcoming matches', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: false,
      },
    ]);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toEqual({ eligible: false, reason: 'fellowship_not_accepted' });
  });

  it('returns eligible with email+firstName when a matching accepted upcoming exists', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toMatchObject({
      eligible: true,
      email: 'ada@example.com',
      firstName: 'Ada',
      fellowshipId: 10,
    });
  });

  it('returns no_matching_fellowship when no fellowship matches the target year', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2024-07-01',
        endDate: '2025-06-30',
        fellowshipAccepted: true,
      },
    ]);

    const result = await evaluateBioEmailEligibility(1, '2026-2027');

    expect(result).toEqual({ eligible: false, reason: 'no_matching_fellowship' });
  });
});

describe('dispatchOne', () => {
  it('returns not_claimed when the atomic PENDING→SENDING flip does not win', async () => {
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 0 });

    const outcome = await dispatchOne('evt_x');

    expect(outcome).toBe('not_claimed');
    expect(mockPrisma.appointeeEmailEvent.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('marks event SENT and records messageId on SES success', async () => {
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_ok',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 10,
    });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    mockEmail.sendBioProjectDescriptionEmail.mockResolvedValue({ messageId: 'ses-123' });
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const outcome = await dispatchOne('evt_ok');

    expect(outcome).toBe('sent');
    const updateCall = (mockPrisma.appointeeEmailEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SENT');
    expect(updateCall.data.sesMessageId).toBe('ses-123');
    expect(updateCall.data.sentAt).toBeInstanceOf(Date);
  });

  it('marks event SKIPPED with a reason when eligibility is lost at dispatch time', async () => {
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_skip',
      contactId: 1,
      academicYear: '2026-2027',
    });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([]);
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const outcome = await dispatchOne('evt_skip');

    expect(outcome).toBe('skipped');
    const updateCall = (mockPrisma.appointeeEmailEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SKIPPED');
    expect(updateCall.data.failureReason).toBe('no_matching_fellowship');
    expect(mockEmail.sendBioProjectDescriptionEmail).not.toHaveBeenCalled();
  });

  it('defers (reverts to PENDING) when an upstream CiviCRM fetch throws', async () => {
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_def',
      contactId: 1,
      academicYear: '2026-2027',
    });
    mockCivicrm.getContactById.mockRejectedValue(new Error('CiviCRM down'));
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const outcome = await dispatchOne('evt_def');

    expect(outcome).toBe('deferred');
    const updateCall = (mockPrisma.appointeeEmailEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe('PENDING');
    expect(mockEmail.sendBioProjectDescriptionEmail).not.toHaveBeenCalled();
  });

  it('returns sent and preserves sesMessageId when SES succeeds but the SENT persistence write fails', async () => {
    // Scenario: SES accepts the email, then the DB write to mark the row SENT
    // throws (e.g., transient connection drop). We MUST NOT mark FAILED —
    // that would (a) mislead the admin and (b) combined with the stale-
    // SENDING reclaim, cause a duplicate send. Instead we best-effort persist
    // sesMessageId alone so the reclaim filter (sesMessageId: null) will
    // skip this row, and we return 'sent' so the caller doesn't retry.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_partial',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 10,
    });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    mockEmail.sendBioProjectDescriptionEmail.mockResolvedValue({ messageId: 'ses-partial' });
    // First update (mark SENT) throws. Second update (best-effort messageId)
    // succeeds.
    (mockPrisma.appointeeEmailEvent.update as any)
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce({});

    const outcome = await dispatchOne('evt_partial');

    expect(outcome).toBe('sent');

    // Two update calls: first the SENT attempt, second the partial-write
    // fallback recording ONLY sesMessageId (no status=FAILED anywhere).
    const calls = (mockPrisma.appointeeEmailEvent.update as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].data.status).toBe('SENT');
    // Fallback call must NOT carry a status transition — just the messageId —
    // because any status transition here is either misleading (SENT already
    // failed to persist) or dangerous (FAILED would trigger a duplicate).
    expect(calls[1][0].data).toEqual({ sesMessageId: 'ses-partial' });
    expect(calls[1][0].data.status).toBeUndefined();
  });

  it('marks event FAILED with a reason when SES rejects the send', async () => {
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_fail',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 10,
    });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    mockEmail.sendBioProjectDescriptionEmail.mockRejectedValue(new Error('SES bounce'));
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const outcome = await dispatchOne('evt_fail');

    expect(outcome).toBe('failed');
    const updateCall = (mockPrisma.appointeeEmailEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe('FAILED');
    expect(updateCall.data.failureReason).toContain('SES bounce');
  });

  it('routes emailType=VIT_ID_INVITATION to sendVitIdInvitationEmail and the VIT eligibility check', async () => {
    // Guards the emailType branching in dispatchOne. If this regresses, a
    // VIT invitation event would be evaluated against bio-email eligibility
    // (wrong preconditions) and/or sent via sendBioProjectDescriptionEmail
    // (wrong template, wrong fromName).
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_vit',
      emailType: 'VIT_ID_INVITATION',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 42,
    });
    // VIT eligibility path: no Auth0 user, contact exists, fellowship accepted.
    mockAuth0.listUsersByRole.mockResolvedValue([]);
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 42,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    (mockEmail.sendVitIdInvitationEmail as any).mockResolvedValue({
      messageId: 'ses-vit-1',
    });
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const outcome = await dispatchOne('evt_vit');

    expect(outcome).toBe('sent');
    // Correct sender was called.
    expect(mockEmail.sendVitIdInvitationEmail).toHaveBeenCalledWith({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    // Bio sender was NOT called (the branching is strict, not a fall-through).
    expect(mockEmail.sendBioProjectDescriptionEmail).not.toHaveBeenCalled();
  });

  it('SKIPS with fellowship_id_mismatch when the event and eligibility resolve to different fellowships', async () => {
    // Defensive guard for the "CiviCRM invariant without a DB constraint"
    // case: if a contact ever has two fellowships in the same year, the
    // evaluator picks whichever `.find()` hits first — but the event was
    // enqueued against a specific fellowship id. Dispatching would flip
    // the wrong fellowship's status to SENT. The guard here short-circuits
    // that and marks the row SKIPPED with a recognizable reason so
    // operators see what happened.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_mismatch',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 999, // enqueue against fellowship 999
    });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com',
    });
    // Eligibility resolves to fellowship 10 (the default in tests) — not 999.
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const outcome = await dispatchOne('evt_mismatch');

    expect(outcome).toBe('skipped');
    // Neither sender was called — the guard kicked in BEFORE SES.
    expect(mockEmail.sendBioProjectDescriptionEmail).not.toHaveBeenCalled();
    expect(mockEmail.sendVitIdInvitationEmail).not.toHaveBeenCalled();
    // The row is marked SKIPPED with a machine-readable reason.
    const updateCall = (mockPrisma.appointeeEmailEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SKIPPED');
    expect(updateCall.data.failureReason).toBe('fellowship_id_mismatch');
  });
});

describe('sendBioEmailManually', () => {
  it('returns {ok: false, reason} when the contact is ineligible', async () => {
    mockCivicrm.getContactById.mockResolvedValue(null);

    const result = await sendBioEmailManually({
      contactId: 99,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });

    expect(result).toEqual({ ok: false, reason: 'no_matching_fellowship' });
  });

  it('returns already_sent when a SENT event already exists', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue({
      id: 'evt_sent',
      status: 'SENT',
      sentAt: new Date(),
    });

    const result = await sendBioEmailManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });

    expect(result).toEqual({ ok: false, reason: 'already_sent' });
  });

  it('preserves a SENT event and creates a new row when resend=true', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue({
      id: 'evt_sent',
      status: 'SENT',
      sentAt: new Date('2026-04-23T12:00:00Z'),
    });
    (mockPrisma.appointeeEmailEvent.create as any).mockResolvedValue({
      id: 'evt_resend',
      status: 'PENDING',
      emailType: 'BIO_PROJECT_DESCRIPTION',
    });
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any)
      .mockResolvedValueOnce({
        id: 'evt_resend',
        status: 'SENDING',
        emailType: 'BIO_PROJECT_DESCRIPTION',
        contactId: 1,
        academicYear: '2026-2027',
        fellowshipId: 10,
      })
      .mockResolvedValueOnce({
        id: 'evt_resend',
        status: 'SENT',
        sentAt: new Date('2026-04-24T12:00:00Z'),
      });
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});
    mockEmail.sendBioProjectDescriptionEmail.mockResolvedValue({
      messageId: 'ses-resend',
    });

    const result = await sendBioEmailManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
      resend: true,
    });

    expect(mockPrisma.appointeeEmailEvent.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      eventId: 'evt_resend',
      status: 'SENT',
    });
  });

  // Shared eligibility/fellowship setup for the dispatch-outcome tests below.
  // Each test drives a specific dispatchOne outcome via targeted mock overrides.
  function primeEligibleContact() {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 10,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: 'evt_new', status: 'PENDING', ...args.data })
    );
    // Lets dispatchOne's atomic PENDING→SENDING flip win.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
  }

  it('returns email_send_failed when dispatchOne returns failed (SES rejection)', async () => {
    primeEligibleContact();
    // Inside dispatchOne: findUniqueOrThrow returns the SENDING row.
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_new',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 10,
    });
    mockEmail.sendBioProjectDescriptionEmail.mockRejectedValue(new Error('SES 550'));
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const result = await sendBioEmailManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'email_send_failed' });
  });

  it('returns {ok:false, reason} when dispatchOne skips with a recognized ineligibility reason', async () => {
    // Pre-check passes (eligibility.eligible=true). Then dispatchOne re-checks
    // and finds the fellowship has disappeared — it writes status=SKIPPED with
    // failureReason='no_matching_fellowship'. sendBioEmailManually should map
    // that back to a user-facing reason instead of a success toast.
    primeEligibleContact();
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_new',
      contactId: 1,
      academicYear: '2026-2027',
      status: 'SKIPPED',
      failureReason: 'no_matching_fellowship',
      sentAt: null,
    });
    // Second call to getFellowships happens inside dispatchOne's re-check.
    // Override it to return [] so eligibility is lost.
    mockCivicrm.getFellowships
      .mockResolvedValueOnce([
        {
          id: 10,
          contactId: 1,
          startDate: '2026-07-01',
          endDate: '2027-06-30',
          fellowshipAccepted: true,
        },
      ])
      .mockResolvedValueOnce([]);
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    const result = await sendBioEmailManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });

    expect(result).toEqual({ ok: false, reason: 'no_matching_fellowship' });
  });

  it('throws dispatch_skipped_unexpected when dispatchOne skips with an unrecognized failureReason', async () => {
    primeEligibleContact();
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_new',
      contactId: 1,
      academicYear: '2026-2027',
      status: 'SKIPPED',
      failureReason: 'something_weird_from_the_future',
      sentAt: null,
    });
    mockCivicrm.getFellowships
      .mockResolvedValueOnce([
        {
          id: 10,
          contactId: 1,
          startDate: '2026-07-01',
          endDate: '2027-06-30',
          fellowshipAccepted: true,
        },
      ])
      .mockResolvedValueOnce([]);
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    await expect(
      sendBioEmailManually({
        contactId: 1,
        academicYear: '2026-2027',
        triggeredBy: 'admin_manual:u1',
      })
    ).rejects.toThrow('dispatch_skipped_unexpected');
  });
});

describe('dispatchPendingEmails', () => {
  it('reclaims stale SENDING rows back to PENDING before scanning due work', async () => {
    // First updateMany call is the stale-SENDING reclaim; second call is the
    // atomic PENDING→SENDING flip that dispatchOne does per event. We return
    // count:2 from the reclaim and no PENDING work after to keep the test
    // focused on the reclaim step.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValueOnce({ count: 2 });
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([]);

    const now = new Date('2026-04-10T12:00:00Z');
    const result = await dispatchPendingEmails({ now });

    expect(result.reclaimed).toBe(2);
    expect(result.processed).toBe(0);

    const reclaimCall = (mockPrisma.appointeeEmailEvent.updateMany as any).mock.calls[0][0];
    expect(reclaimCall.where.status).toBe('SENDING');
    // Cutoff must be 1h before `now` (STALE_SENDING_THRESHOLD_MS = 3_600_000).
    const cutoff: Date = reclaimCall.where.updatedAt.lt;
    expect(cutoff.getTime()).toBe(now.getTime() - 60 * 60 * 1000);
    // MUST exclude rows that already have an SES messageId — those reached
    // SES successfully but failed the post-send status write. Reclaiming them
    // would send a duplicate email.
    expect(reclaimCall.where.sesMessageId).toBeNull();
    expect(reclaimCall.data.status).toBe('PENDING');
  });

  it('reports reclaimed:0 when nothing is stuck', async () => {
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([]);

    const result = await dispatchPendingEmails({ now: new Date('2026-04-10T12:00:00Z') });

    expect(result.reclaimed).toBe(0);
    expect(result.processed).toBe(0);
  });

  it('scans ONLY BIO_PROJECT_DESCRIPTION rows — VIT_ID_INVITATION is manual-only (IRON INVARIANT)', async () => {
    // The cron must never auto-send a VIT ID invitation. Angela's manual
    // click is the only dispatch path for that type. If this filter
    // regresses, the 24h-delay cron will start mailing every pending
    // invitation without Angela's review — the exact opposite of the
    // whole "manual-only" design. This test is the load-bearing guard.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([]);

    await dispatchPendingEmails({ now: new Date('2026-04-10T12:00:00Z') });

    // findMany was called once with a where clause that filters by emailType.
    const findManyCall = (mockPrisma.appointeeEmailEvent.findMany as any).mock.calls[0][0];
    expect(findManyCall.where.emailType).toBe('BIO_PROJECT_DESCRIPTION');
    // Defense-in-depth: the filter must be a direct equality check, not an
    // `in` or a negation. A `not` filter would silently allow any new email
    // type added in the future to leak into the cron. Equality on BIO is
    // the whitelist pattern and must stay that way.
    expect(findManyCall.where.emailType).not.toEqual(
      expect.objectContaining({ not: expect.anything() })
    );
  });
});

describe('getEmailStatusForContacts', () => {
  it('returns empty map when contactIds is empty', async () => {
    const result = await getEmailStatusForContacts([], ['2026-2027']);
    expect(result.size).toBe(0);
    expect(mockPrisma.appointeeEmailEvent.findMany).not.toHaveBeenCalled();
  });

  it('returns empty map when academicYears is empty', async () => {
    const result = await getEmailStatusForContacts([1, 2], []);
    expect(result.size).toBe(0);
    expect(mockPrisma.appointeeEmailEvent.findMany).not.toHaveBeenCalled();
  });

  it('keys the returned map by `${fellowshipId}:${emailType}` and uses the latest row', async () => {
    const sent = new Date('2026-04-10');
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([
      {
        contactId: 1,
        academicYear: '2026-2027',
        fellowshipId: 101,
        status: 'PENDING',
        sentAt: null,
        emailType: 'BIO_PROJECT_DESCRIPTION',
      },
      {
        contactId: 1,
        academicYear: '2026-2027',
        fellowshipId: 101,
        status: 'SENT',
        sentAt: sent,
        emailType: 'BIO_PROJECT_DESCRIPTION',
      },
      {
        contactId: 2,
        academicYear: '2026-2027',
        fellowshipId: 202,
        status: 'PENDING',
        sentAt: null,
        emailType: 'VIT_ID_INVITATION',
      },
    ]);

    const result = await getEmailStatusForContacts([1, 2, 3], ['2026-2027']);

    expect(result.size).toBe(2);
    expect(result.get('101:BIO_PROJECT_DESCRIPTION')).toEqual({
      status: 'PENDING',
      sentAt: null,
      academicYear: '2026-2027',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      fellowshipId: 101,
      sendCount: 2,
    });
    expect(result.get('202:VIT_ID_INVITATION')).toEqual({
      status: 'PENDING',
      sentAt: null,
      academicYear: '2026-2027',
      emailType: 'VIT_ID_INVITATION',
      fellowshipId: 202,
      sendCount: 1,
    });
    expect(result.get('303:BIO_PROJECT_DESCRIPTION')).toBeUndefined();
  });

  it('keeps two fellowships for the same contact+year as distinct entries (no silent collapse)', async () => {
    // Defense against the business-invariant-without-constraint scenario:
    // if CiviCRM ever has two fellowships for the same (contactId, year),
    // the dashboard events must not merge them. Keying by fellowshipId
    // preserves one entry per fellowship.
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([
      {
        contactId: 1,
        academicYear: '2026-2027',
        fellowshipId: 501,
        status: 'SENT',
        sentAt: new Date(),
        emailType: 'BIO_PROJECT_DESCRIPTION',
      },
      {
        contactId: 1,
        academicYear: '2026-2027',
        fellowshipId: 502, // same contact + year, DIFFERENT fellowship
        status: 'PENDING',
        sentAt: null,
        emailType: 'BIO_PROJECT_DESCRIPTION',
      },
    ]);
    const result = await getEmailStatusForContacts([1], ['2026-2027']);
    expect(result.size).toBe(2);
    expect(result.get('501:BIO_PROJECT_DESCRIPTION')?.status).toBe('SENT');
    expect(result.get('501:BIO_PROJECT_DESCRIPTION')?.sendCount).toBe(1);
    expect(result.get('502:BIO_PROJECT_DESCRIPTION')?.status).toBe('PENDING');
    expect(result.get('502:BIO_PROJECT_DESCRIPTION')?.sendCount).toBe(1);
  });

  it('filters by the types argument — bio only when requested', async () => {
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([]);
    await getEmailStatusForContacts(
      [1],
      ['2026-2027'],
      ['BIO_PROJECT_DESCRIPTION']
    );
    const call = (mockPrisma.appointeeEmailEvent.findMany as any).mock.calls[0][0];
    expect(call.where.emailType).toEqual({ in: ['BIO_PROJECT_DESCRIPTION'] });
  });

  it('defaults to querying both types when types is omitted', async () => {
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([]);
    await getEmailStatusForContacts([1], ['2026-2027']);
    const call = (mockPrisma.appointeeEmailEvent.findMany as any).mock.calls[0][0];
    expect(call.where.emailType).toEqual({
      in: ['BIO_PROJECT_DESCRIPTION', 'VIT_ID_INVITATION'],
    });
  });
});

// ───────────────────────────────────────────────────────────────────────
// VIT ID invitation eligibility — inverted preconditions vs bio email.
// Key difference: VIT invitation requires the contact NOT to have a VIT ID
// already (the opposite of bio), plus strict missing_first_name handling
// and a 3-throw civicrm_unavailable fallback.
// ───────────────────────────────────────────────────────────────────────

describe('evaluateVitIdInvitationEligibility', () => {
  // For "no VIT ID" path, override listUsersByRole to empty so the ladder
  // returns 'no-account' by default. Individual tests override further for
  // needs-review / already-has-VIT-ID scenarios.
  beforeEach(() => {
    mockAuth0.listUsersByRole.mockResolvedValue([]);
  });

  it('returns civicrm_unavailable when getContactById throws', async () => {
    mockCivicrm.getContactById.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'civicrm_unavailable' });
    // Must NOT call downstream CiviCRM lookups after the first failure.
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns no_matching_fellowship when contact does not exist', async () => {
    mockCivicrm.getContactById.mockResolvedValue(null);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'no_matching_fellowship' });
  });

  it('returns missing_first_name when firstName is empty', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: '',
      lastName: 'Smith',
      email: 'smith@example.com',
    });
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'missing_first_name' });
  });

  it('returns missing_first_name when firstName is whitespace-only', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: '   ',
      lastName: 'Smith',
      email: 'smith@example.com',
    });
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'missing_first_name' });
  });

  it('returns no_primary_email when contact has no email', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: '',
    });
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'no_primary_email' });
  });

  it('returns civicrm_unavailable when the ladder fetch (listUsersByRole) throws', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockAuth0.listUsersByRole.mockRejectedValue(new Error('Auth0 down'));
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'civicrm_unavailable' });
  });

  it('returns needs_review when match ladder resolves to needs-review (name collision)', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Maria',
      lastName: 'Rossi',
      email: 'maria@example.com',
    });
    // Two Auth0 users with the same normalized name, no email or civicrm_id
    // match — ladder falls to tier 4 (name) and sees a collision.
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|maria1', email: 'maria1@old.com', name: 'Maria Rossi' },
      { user_id: 'auth0|maria2', email: 'maria2@old.com', name: 'MARIA ROSSI' },
    ]);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'needs_review' });
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns already_has_vit_id when ladder resolves to active (contact already has VIT ID)', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    // Contact's email matches an Auth0 user via tier 1 — status 'active'.
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[1, { primary: 'sofia@example.com', secondaries: [] }]])
    );
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|sofia', email: 'sofia@example.com', name: 'Sofia Rossi' },
    ]);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'already_has_vit_id' });
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns already_has_vit_id when ladder resolves to active-different-email', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Thomas',
      lastName: 'Mueller',
      email: 't.mueller.new@example.com',
    });
    // Returning fellow: civicrm_id tier matches under an old email.
    mockAuth0.listUsersByRole.mockResolvedValue([
      {
        user_id: 'auth0|thomas',
        email: 't.mueller@old.com',
        name: 'Thomas Mueller',
        civicrmId: '1',
      },
    ]);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'already_has_vit_id' });
    // Mirror the 'active' sibling test (line ~1112): confirm the evaluator
    // short-circuits BEFORE querying fellowships. already_has_vit_id should
    // be decidable from the ladder alone — fetching fellowships after that
    // would be wasted work.
    expect(mockCivicrm.getFellowships).not.toHaveBeenCalled();
  });

  it('returns civicrm_unavailable when getFellowships throws', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockAuth0.listUsersByRole.mockResolvedValue([]); // ladder: no-account
    mockCivicrm.getFellowships.mockRejectedValue(new Error('DB timeout'));
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'civicrm_unavailable' });
  });

  it('returns no_matching_fellowship when no fellowship matches the target year', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 99,
        contactId: 1,
        startDate: '2024-07-01',
        endDate: '2025-06-30',
        fellowshipAccepted: true,
      },
    ]);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'no_matching_fellowship' });
  });

  it('returns fellowship_not_accepted when a matching fellowship exists but is unaccepted', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 77,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: false,
      },
    ]);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({ eligible: false, reason: 'fellowship_not_accepted' });
  });

  it('returns eligible with fellowshipId on the happy path (accepted upcoming fellowship)', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 42,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
    const result = await evaluateVitIdInvitationEligibility(1, '2026-2027');
    expect(result).toEqual({
      eligible: true,
      email: 'sofia@example.com',
      firstName: 'Sofia',
      fellowshipId: 42,
    });
  });
});

describe('sendVitIdInvitationManually', () => {
  // Install the common "eligible contact with no VIT ID, accepted fellowship"
  // baseline. Individual tests override to drive specific dispatch outcomes.
  function primeEligibleContactNoVitId() {
    mockAuth0.listUsersByRole.mockResolvedValue([]); // ladder: no-account
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 42,
        contactId: 1,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        fellowshipAccepted: true,
      },
    ]);
  }

  it('returns {ok: false, reason} when the contact is ineligible', async () => {
    mockCivicrm.getContactById.mockResolvedValue(null);
    const result = await sendVitIdInvitationManually({
      contactId: 99,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'no_matching_fellowship' });
  });

  it('returns {ok: false, reason: "civicrm_unavailable"} when the eligibility fetch throws', async () => {
    mockCivicrm.getContactById.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'civicrm_unavailable' });
  });

  it('returns already_sent when a SENT event already exists for this fellowship', async () => {
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue({
      id: 'evt_sent',
      status: 'SENT',
      sentAt: new Date(),
    });
    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'already_sent' });
  });

  it('returns existing SENDING event without creating a duplicate (in-flight short-circuit)', async () => {
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue({
      id: 'evt_sending',
      status: 'SENDING',
      sentAt: null,
    });
    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({
      ok: true,
      eventId: 'evt_sending',
      status: 'SENDING',
      sentAt: null,
    });
    expect(mockPrisma.appointeeEmailEvent.create).not.toHaveBeenCalled();
  });

  it('RE-DISPATCHES an existing PENDING row instead of short-circuiting', async () => {
    // Unlike bio email, the cron NEVER picks up VIT invitations, so a
    // PENDING VIT row would be stranded forever if sendVitIdInvitationManually
    // short-circuited on it. This test asserts the row gets re-dispatched
    // through the normal dispatchOne pipeline.
    primeEligibleContactNoVitId();
    const pendingEvt = {
      id: 'evt_stuck_pending',
      status: 'PENDING',
      emailType: 'VIT_ID_INVITATION',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 42,
      sentAt: null,
      failureReason: null,
      sesMessageId: null,
      sendAfter: new Date(),
    };
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(
      pendingEvt
    );
    // dispatchOne: atomic flip succeeds against the existing row, eligibility
    // holds, SES accepts.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any)
      .mockResolvedValueOnce({ ...pendingEvt, status: 'SENDING' })
      .mockResolvedValueOnce({ ...pendingEvt, status: 'SENT', sentAt: new Date() });
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue(pendingEvt);
    (mockEmail.sendVitIdInvitationEmail as any).mockResolvedValue({ messageId: 'ses-2' });

    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });

    // Row was NOT deleted and NOT re-created — it was the same id.
    expect(mockPrisma.appointeeEmailEvent.delete).not.toHaveBeenCalled();
    expect(mockPrisma.appointeeEmailEvent.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      eventId: 'evt_stuck_pending',
      status: 'SENT',
    });
    // dispatchOne was called via the shared code path.
    expect(mockEmail.sendVitIdInvitationEmail).toHaveBeenCalled();
  });

  it('preserves a FAILED row and retries fresh', async () => {
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue({
      id: 'evt_failed',
      status: 'FAILED',
      sentAt: null,
    });

    // Mock dispatch path: atomic PENDING→SENDING succeeds, eligibility holds,
    // SES returns a message id.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    const newEvt = {
      id: 'evt_retry',
      status: 'PENDING',
      emailType: 'VIT_ID_INVITATION',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 42,
      sentAt: null,
      failureReason: null,
      sesMessageId: null,
      sendAfter: new Date(),
    };
    (mockPrisma.appointeeEmailEvent.create as any).mockResolvedValue(newEvt);
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any)
      .mockResolvedValueOnce(newEvt)
      .mockResolvedValueOnce({ ...newEvt, status: 'SENT', sentAt: new Date() });
    (mockPrisma.appointeeEmailEvent.update as any).mockImplementation((args: any) =>
      Promise.resolve({ ...newEvt, ...args.data })
    );
    (mockEmail.sendVitIdInvitationEmail as any).mockResolvedValue({ messageId: 'ses-1' });

    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(mockPrisma.appointeeEmailEvent.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, eventId: 'evt_retry' });
  });

  it('maps civicrm_unavailable at dispatch time back to {ok: false, reason} (no deferred path for VIT)', async () => {
    // For bio emails, dispatchOne catches throws from evaluateBioEmailEligibility
    // and marks the row deferred (PENDING again) so the cron retries later.
    // For VIT invitations, evaluateVitIdInvitationEligibility catches CiviCRM
    // errors internally and returns { eligible: false, reason: 'civicrm_unavailable' }
    // — the row is marked SKIPPED with that reason and sendVitIdInvitationManually
    // maps it back. Angela's modal surfaces it as the 503-worthy reason,
    // rather than the cron-style deferral bio uses.
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockResolvedValue({
      id: 'evt_new',
      status: 'PENDING',
      emailType: 'VIT_ID_INVITATION',
    });
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any)
      .mockResolvedValueOnce({
        id: 'evt_new',
        status: 'SENDING',
        emailType: 'VIT_ID_INVITATION',
        contactId: 1,
        academicYear: '2026-2027',
      })
      .mockResolvedValueOnce({
        id: 'evt_new',
        status: 'SKIPPED',
        emailType: 'VIT_ID_INVITATION',
        sentAt: null,
        failureReason: 'civicrm_unavailable',
      });
    // Dispatch-time eligibility re-check throws inside the eval, which catches
    // and returns { reason: 'civicrm_unavailable' }.
    mockCivicrm.getContactById
      .mockResolvedValueOnce({
        id: 1,
        firstName: 'Sofia',
        lastName: 'Rossi',
        email: 'sofia@example.com',
      })
      .mockRejectedValueOnce(new Error('CiviCRM unreachable at dispatch'));

    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'civicrm_unavailable' });
  });

  it('returns email_send_failed when SES rejects the send', async () => {
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockResolvedValue({
      id: 'evt_new',
      status: 'PENDING',
      emailType: 'VIT_ID_INVITATION',
    });
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_new',
      status: 'SENDING',
      emailType: 'VIT_ID_INVITATION',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 42,
    });
    // Eligibility at dispatch time still holds.
    (mockEmail.sendVitIdInvitationEmail as any).mockRejectedValue(
      new Error('SES rejected')
    );

    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'email_send_failed' });
  });

  it('maps a skipped-dispatch with a recognized reason back to {ok: false, reason}', async () => {
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockResolvedValue({
      id: 'evt_new',
      status: 'PENDING',
      emailType: 'VIT_ID_INVITATION',
    });
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    // Inside dispatchOne: findUniqueOrThrow returns the claimed row,
    // eligibility re-check fails with a recognized reason, row is marked SKIPPED.
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any)
      .mockResolvedValueOnce({
        id: 'evt_new',
        status: 'SENDING',
        emailType: 'VIT_ID_INVITATION',
        contactId: 1,
        academicYear: '2026-2027',
      })
      .mockResolvedValueOnce({
        id: 'evt_new',
        status: 'SKIPPED',
        emailType: 'VIT_ID_INVITATION',
        sentAt: null,
        failureReason: 'needs_review',
      });
    // Second getContactById call (inside dispatchOne eligibility) returns a
    // contact whose ladder now says needs-review.
    mockAuth0.listUsersByRole
      .mockResolvedValueOnce([]) // first eligibility pre-check in send path
      .mockResolvedValueOnce([
        { user_id: 'auth0|a', email: 'a@x.com', name: 'Sofia Rossi' },
        { user_id: 'auth0|b', email: 'b@x.com', name: 'SOFIA ROSSI' },
      ]); // dispatch-time re-check: name collision

    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toEqual({ ok: false, reason: 'needs_review' });
  });

  it('happy path returns {ok: true, ...} when dispatch succeeds', async () => {
    primeEligibleContactNoVitId();
    (mockPrisma.appointeeEmailEvent.findFirst as any).mockResolvedValue(null);
    const newEvt = {
      id: 'evt_new',
      status: 'PENDING',
      emailType: 'VIT_ID_INVITATION',
      contactId: 1,
      academicYear: '2026-2027',
      fellowshipId: 42,
      sentAt: null,
      failureReason: null,
      sesMessageId: null,
      sendAfter: new Date(),
    };
    (mockPrisma.appointeeEmailEvent.create as any).mockResolvedValue(newEvt);
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any)
      .mockResolvedValueOnce(newEvt)
      .mockResolvedValueOnce({ ...newEvt, status: 'SENT', sentAt: new Date() });
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({
      ...newEvt,
      status: 'SENT',
      sentAt: new Date(),
    });
    (mockEmail.sendVitIdInvitationEmail as any).mockResolvedValue({ messageId: 'ses-123' });

    const result = await sendVitIdInvitationManually({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:u1',
    });
    expect(result).toMatchObject({
      ok: true,
      eventId: 'evt_new',
      status: 'SENT',
    });
    expect(mockEmail.sendVitIdInvitationEmail).toHaveBeenCalledWith({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
  });
});
