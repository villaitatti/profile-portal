import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

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
  listInvitations,
  markNominationSent,
  ServiceError,
  type NameLookup,
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

    expect(mockPrisma.formInvitation.findUnique).toHaveBeenCalledWith({
      where: {
        fellowshipId_formType_academicYear: {
          fellowshipId: 123,
          formType: 'fellow-memorandum',
          academicYear: '2026-2027',
        },
      },
    });
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

    expect(mockPrisma.formInvitation.findUnique).toHaveBeenCalledWith({
      where: {
        fellowshipId_formType_academicYear: {
          fellowshipId: 123,
          formType: 'fellow-memorandum',
          academicYear: '2026-2027',
        },
      },
    });
    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
  });

  it('returns an existing invitation before enforcing a changed appointment mapping', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_existing',
      token: 'existing-token',
      formType: 'fellow-memorandum',
      status: 'pending',
    } as any);

    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum',
        appointmentType: 'Visiting Professor',
        triggeredBy: 'admin:test',
      })
    ).resolves.toMatchObject({
      id: 'inv_existing',
      token: 'existing-token',
      created: false,
    });

    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
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
      where: { id: 'inv_1', status: 'pending' },
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

  it('converts non-pending or missing invitations into a ServiceError', async () => {
    mockPrisma.formInvitation.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      })
    );

    await expect(markNominationSent('inv_submitted', '2026-05-04')).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 409,
      message: 'Form invitation is not pending or does not exist',
      details: {
        code: 'nomination_sent_not_allowed',
        prismaCode: 'P2025',
        originalError: {
          name: 'PrismaClientKnownRequestError',
          message: 'Record not found',
        },
      },
    });

    expect(mockPrisma.formInvitation.update).toHaveBeenCalledWith({
      where: { id: 'inv_submitted', status: 'pending' },
      data: { nominationSentAt: new Date('2026-05-04T12:00:00.000Z') },
    });
  });

  it('wraps other known Prisma errors when saving nomination sent dates', async () => {
    mockPrisma.formInvitation.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Database constraint failed', {
        code: 'P2003',
        clientVersion: 'test',
      })
    );

    await expect(markNominationSent('inv_1', '2026-05-04')).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 500,
      message: 'Could not mark nomination as sent',
      details: {
        code: 'prisma_error',
        prismaCode: 'P2003',
        originalError: {
          name: 'PrismaClientKnownRequestError',
          message: 'Database constraint failed',
        },
      },
    });
  });
});

describe('listInvitations', () => {
  const baseRow = {
    id: 'inv_1',
    token: 'tok_1',
    fellowshipId: 10,
    contactId: 100,
    academicYear: '2026-2027',
    formType: 'fellow-memorandum',
    status: 'submitted',
    nominationSentAt: null,
    submittedAt: new Date('2026-04-24T10:00:00Z'),
    createdAt: new Date('2026-04-20T10:00:00Z'),
    updatedAt: new Date('2026-04-24T10:00:00Z'),
    response: { id: 'r_1', data: {}, createdAt: new Date('2026-04-24T10:00:00Z') },
  };

  it('does not load response.data in the list query (PII stays out of the hot path)', async () => {
    // Regression guard: the archive list only needs presence of a response
    // (to compute hasResponse), not the full JSON. Loading response.data on
    // every row pulls submitted PII into server memory on every admin page
    // open. The `include: { response: { select: { id: true } } }` shape
    // below is the contract — if a future refactor changes it back to
    // `response: true`, this test fires.
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseRow] as any)
      .mockResolvedValueOnce([] as any);

    await listInvitations({ status: 'submitted' });

    const itemsQueryArgs = mockPrisma.formInvitation.findMany.mock.calls[0]![0]!;
    expect(itemsQueryArgs.include).toEqual({
      response: { select: { id: true } },
    });
  });

  it('exposes response as a boolean `hasResponse`, never as raw data', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseRow] as any)
      .mockResolvedValueOnce([] as any);

    const result = await listInvitations({ status: 'submitted' });

    expect(result.items[0]).toHaveProperty('hasResponse', true);
    expect(result.items[0]).not.toHaveProperty('response');
    expect(result.items[0]).not.toHaveProperty('data');
  });

  it('returns { items, facets } with contactName/formTitle joined onto each row', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseRow] as any) // items
      .mockResolvedValueOnce([
        { academicYear: '2026-2027', formType: 'fellow-memorandum' },
        { academicYear: '2025-2026', formType: 'fellow-memorandum' },
      ] as any); // facet rows

    const nameLookup: NameLookup = {
      getName: (id: number) => (id === 100 ? 'Maria Bianchi' : null),
    };

    const result = await listInvitations({ status: 'submitted' }, nameLookup);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].contactName).toBe('Maria Bianchi');
    expect(result.items[0].formTitle).toBe('Memorandum I Tatti Fellowship');
    expect(result.facets.academicYears).toEqual(['2026-2027', '2025-2026']); // sorted desc
    expect(result.facets.formTypes).toEqual(['fellow-memorandum']);
  });

  it('falls back to null contactName when nameLookup returns null (CiviCRM-down graceful degrade)', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseRow] as any)
      .mockResolvedValueOnce([{ academicYear: '2026-2027', formType: 'fellow-memorandum' }] as any);

    const result = await listInvitations({ status: 'submitted' }, { getName: () => null });

    expect(result.items[0].contactName).toBeNull();
    // The rest of the row still makes it through — the UI renders "Contact #<id>".
    expect(result.items[0].contactId).toBe(100);
    expect(result.items[0].formTitle).toBe('Memorandum I Tatti Fellowship');
  });

  it('renders a "(retired form: ...)" title when formType is not in the registry', async () => {
    const retiredRow = { ...baseRow, formType: 'ancient-survey-2019' };
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([retiredRow] as any)
      .mockResolvedValueOnce([{ academicYear: '2026-2027', formType: 'ancient-survey-2019' }] as any);

    const result = await listInvitations({ status: 'submitted' }, { getName: () => 'x' });

    expect(result.items[0].formTitle).toBe('(retired form: ancient-survey-2019)');
  });

  it('pins ORDER BY submittedAt DESC, id DESC on the items query', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await listInvitations({ status: 'submitted' });

    const firstCallArgs = mockPrisma.formInvitation.findMany.mock.calls[0]![0]!;
    expect(firstCallArgs.orderBy).toEqual([{ submittedAt: 'desc' }, { id: 'desc' }]);
  });

  it('CRITICAL REGRESSION: academicYear filter still applies to the items query', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await listInvitations({ academicYear: '2026-2027', status: 'submitted' });

    const itemsCallArgs = mockPrisma.formInvitation.findMany.mock.calls[0]![0]!;
    expect(itemsCallArgs.where).toMatchObject({
      academicYear: '2026-2027',
      status: 'submitted',
    });
  });

  it('CRITICAL REGRESSION: status filter still applies to the items query', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await listInvitations({ status: 'submitted' });

    const itemsCallArgs = mockPrisma.formInvitation.findMany.mock.calls[0]![0]!;
    expect(itemsCallArgs.where).toMatchObject({ status: 'submitted' });
  });

  it('facet query IGNORES academicYear and formType filters (dropdowns stay stable)', async () => {
    // Design decision A3: filtering by one academic year should not shrink
    // the Academic Year dropdown to just that year. Facets respect only the
    // status filter.
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await listInvitations({
      academicYear: '2026-2027',
      formType: 'fellow-memorandum',
      status: 'submitted',
    });

    const facetCallArgs = mockPrisma.formInvitation.findMany.mock.calls[1]![0]!;
    expect(facetCallArgs.where).toEqual({ status: 'submitted' });
    // Explicitly: not filtered by year/formType
    expect(facetCallArgs.where).not.toHaveProperty('academicYear');
    expect(facetCallArgs.where).not.toHaveProperty('formType');
  });

  it('dedupes academicYears and formTypes across facet rows', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        { academicYear: '2026-2027', formType: 'fellow-memorandum' },
        { academicYear: '2026-2027', formType: 'fellow-memorandum' },
        { academicYear: '2025-2026', formType: 'fellow-memorandum' },
      ] as any);

    const result = await listInvitations({ status: 'submitted' });

    expect(result.facets.academicYears).toEqual(['2026-2027', '2025-2026']);
    expect(result.facets.formTypes).toEqual(['fellow-memorandum']);
  });
});
