import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    appointeeEmailEvent: {
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
  sendBioEmailManually,
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
// listUsersByRole() + getEmailsForContacts(). We install defaults that
// produce a successful match: a single Auth0 fellow with email
// 'default@example.com' matched by primary email.
//
// We use resetAllMocks (not clearAllMocks) so per-test mockResolvedValue /
// mockRejectedValue stubs do not leak into subsequent tests via the shared
// mocked modules above.
beforeEach(() => {
  vi.resetAllMocks();
  mockAuth0.findUserByEmail.mockResolvedValue({
    user_id: 'auth0|default',
    email: 'default@example.com',
    name: 'Default User',
  });
  // Ladder defaults: Auth0 has one fellow whose civicrm_id metadata points
  // to contact id 1 (used by most tests). This makes reconcile() return
  // 'active-different-email' via civicrm_id for contact 1, regardless of
  // the contact's primary email — which is what existing tests exercise.
  // Tests that want to simulate "no VIT ID" override with an empty list.
  mockAuth0.listUsersByRole.mockResolvedValue([
    {
      user_id: 'auth0|default',
      email: 'default@example.com',
      name: 'Default User',
      civicrmId: '1',
    },
  ]);
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
    (mockPrisma.appointeeEmailEvent.findUnique as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: 'evt_new', status: 'PENDING', ...args.data })
    );

    const before = Date.now();
    const result = await enqueueBioEmail({
      contactId: 100,
      academicYear: '2026-2027',
      triggeredBy: 'claim_auto',
    });

    expect(result.created).toBe(true);
    expect(result.eventId).toBe('evt_new');
    expect(result.status).toBe('PENDING');

    const createCall = (mockPrisma.appointeeEmailEvent.create as any).mock.calls[0][0];
    expect(createCall.data.contactId).toBe(100);
    expect(createCall.data.academicYear).toBe('2026-2027');
    expect(createCall.data.triggeredBy).toBe('claim_auto');
    expect(createCall.data.emailType).toBe('BIO_PROJECT_DESCRIPTION');
    const deltaMs = createCall.data.sendAfter.getTime() - before;
    // Roughly 24h ± small test overhead
    expect(deltaMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('respects delayHours: 0 for the manual path', async () => {
    (mockPrisma.appointeeEmailEvent.findUnique as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: 'evt_now', status: 'PENDING', ...args.data })
    );

    const before = Date.now();
    await enqueueBioEmail({
      contactId: 200,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:user-1',
      delayHours: 0,
    });

    const createCall = (mockPrisma.appointeeEmailEvent.create as any).mock.calls[0][0];
    const delta = createCall.data.sendAfter.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(5_000); // sub-5s
  });

  it('is idempotent: returns the existing event without creating a duplicate', async () => {
    (mockPrisma.appointeeEmailEvent.findUnique as any).mockResolvedValue({
      id: 'evt_existing',
      status: 'PENDING',
    });

    const result = await enqueueBioEmail({
      contactId: 300,
      academicYear: '2026-2027',
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
    (mockPrisma.appointeeEmailEvent.findUnique as any)
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
      triggeredBy: 'claim_auto',
    });

    expect(result.created).toBe(false);
    expect(result.eventId).toBe('evt_winner');
    expect(result.status).toBe('PENDING');
  });

  it('re-throws non-P2002 Prisma errors', async () => {
    (mockPrisma.appointeeEmailEvent.findUnique as any).mockResolvedValue(null);
    const other = new Prisma.PrismaClientKnownRequestError('nope', {
      code: 'P2025',
      clientVersion: 'test',
    });
    (mockPrisma.appointeeEmailEvent.create as any).mockRejectedValue(other);

    await expect(
      enqueueBioEmail({
        contactId: 500,
        academicYear: '2026-2027',
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

    expect(result).toEqual({
      eligible: true,
      email: 'new@x.com',
      firstName: 'Returning',
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

    expect(result).toEqual({
      eligible: true,
      email: 'ada@example.com',
      firstName: 'Ada',
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
    (mockPrisma.appointeeEmailEvent.findUnique as any).mockResolvedValue({
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
    (mockPrisma.appointeeEmailEvent.findUnique as any).mockResolvedValue(null);
    (mockPrisma.appointeeEmailEvent.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: 'evt_new', status: 'PENDING', ...args.data })
    );
    // Lets dispatchOne's atomic PENDING→SENDING flip win.
    (mockPrisma.appointeeEmailEvent.updateMany as any).mockResolvedValue({ count: 1 });
  }

  it('throws ses_send_failed when dispatchOne returns failed (SES rejection)', async () => {
    primeEligibleContact();
    // Inside dispatchOne: findUniqueOrThrow returns the SENDING row.
    (mockPrisma.appointeeEmailEvent.findUniqueOrThrow as any).mockResolvedValue({
      id: 'evt_new',
      contactId: 1,
      academicYear: '2026-2027',
    });
    mockEmail.sendBioProjectDescriptionEmail.mockRejectedValue(new Error('SES 550'));
    (mockPrisma.appointeeEmailEvent.update as any).mockResolvedValue({});

    await expect(
      sendBioEmailManually({
        contactId: 1,
        academicYear: '2026-2027',
        triggeredBy: 'admin_manual:u1',
      })
    ).rejects.toThrow('ses_send_failed');
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

  it('keys the returned map by `${contactId}:${academicYear}`', async () => {
    const sent = new Date('2026-04-10');
    (mockPrisma.appointeeEmailEvent.findMany as any).mockResolvedValue([
      { contactId: 1, academicYear: '2026-2027', status: 'SENT', sentAt: sent },
      { contactId: 2, academicYear: '2026-2027', status: 'PENDING', sentAt: null },
    ]);

    const result = await getEmailStatusForContacts([1, 2, 3], ['2026-2027']);

    expect(result.size).toBe(2);
    expect(result.get('1:2026-2027')).toEqual({
      status: 'SENT',
      sentAt: sent,
      academicYear: '2026-2027',
    });
    expect(result.get('2:2026-2027')).toEqual({
      status: 'PENDING',
      sentAt: null,
      academicYear: '2026-2027',
    });
    expect(result.get('3:2026-2027')).toBeUndefined();
  });
});
