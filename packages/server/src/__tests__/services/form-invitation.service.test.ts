import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    formInvitation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    formResponse: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../workers/form-notification.worker.js', () => ({
  enqueueFormNotification: vi.fn(),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  generateInvitation,
  markNominationSent,
  ServiceError,
} from '../../services/form-invitation.service.js';
import { prisma } from '../../lib/prisma.js';

const mockPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('generateInvitation', () => {
  it('rejects a configured form when the appointment type is not mapped to it', async () => {
    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum',
        appointmentType: 'Visiting Professor',
        enforceAppointmentType: true,
        triggeredBy: 'admin:test',
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 400,
      details: {
        code: 'no_form_configured',
        appointmentType: 'Visiting Professor',
        formType: 'fellow-memorandum',
      },
    } satisfies Partial<ServiceError>);

    expect(mockPrisma.formInvitation.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
  });

  it('rejects link generation when appointment type is missing but enforcement is on', async () => {
    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum',
        enforceAppointmentType: true,
        triggeredBy: 'admin:test',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: {
        code: 'no_form_configured',
        appointmentType: null,
      },
    });

    expect(mockPrisma.formInvitation.findUnique).not.toHaveBeenCalled();
  });
});

describe('markNominationSent', () => {
  it('stores an admin-selected date at noon UTC to avoid date rollover in the UI', async () => {
    mockPrisma.formInvitation.update.mockResolvedValue({
      id: 'inv_1',
      nominationSentAt: new Date('2026-05-04T12:00:00.000Z'),
    } as any);

    await markNominationSent('inv_1', '2026-05-04');

    expect(mockPrisma.formInvitation.update).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { nominationSentAt: new Date('2026-05-04T12:00:00.000Z') },
    });
  });

  it('rejects impossible calendar dates before writing to Prisma', async () => {
    await expect(markNominationSent('inv_1', '2026-99-99')).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 400,
      details: {
        code: 'invalid_nomination_sent_on',
        nominationSentOn: '2026-99-99',
      },
    });

    expect(mockPrisma.formInvitation.update).not.toHaveBeenCalled();
  });
});
