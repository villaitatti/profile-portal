import { describe, it, expect, vi, beforeEach } from 'vitest';

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
}));

vi.mock('../../services/email.service.js', () => ({
  sendBioProjectDescriptionEmail: vi.fn(),
}));

vi.mock('../../env.js', () => ({
  env: {
    APPOINTEE_EMAIL_REDIRECT_TO: '',
    APPOINTEE_EMAIL_BCC: '',
    APPOINTEE_EMAIL_CRON_ENABLED: false,
  },
  isDevMode: false,
}));

import {
  enqueueBioEmail,
  dispatchOne,
  evaluateBioEmailEligibility,
  sendBioEmailManually,
  getEmailStatusForContacts,
  currentAndNextAcademicYears,
} from '../../services/appointee-email.service.js';
import { prisma } from '../../lib/prisma.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as emailService from '../../services/email.service.js';

const mockPrisma = vi.mocked(prisma, true);
const mockCivicrm = vi.mocked(civicrmService);
const mockEmail = vi.mocked(emailService);

beforeEach(() => {
  vi.clearAllMocks();
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
