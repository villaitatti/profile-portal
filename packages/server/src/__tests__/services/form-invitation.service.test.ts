import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    formInvitation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    formResponse: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../workers/form-notification.worker.js', () => ({
  enqueueFormNotification: vi.fn(),
}));

vi.mock('../../env.js', () => ({
  env: { FORM_INVITATION_TTL_DAYS: 180 },
}));

vi.mock('../../lib/form-schema.js', () => ({
  buildFormSchema: () => ({
    safeParse: (data: Record<string, unknown>) => ({ success: true, data }),
  }),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  generateInvitation,
  listInvitations,
  markNominationSent,
  getInvitationByToken,
  resetInvitation,
  submitForm,
  ServiceError,
  type NameLookup,
} from '../../services/form-invitation.service.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueFormNotification } from '../../workers/form-notification.worker.js';

const mockPrisma = vi.mocked(prisma, true);
const mockEnqueueFormNotification = vi.mocked(enqueueFormNotification);

beforeEach(() => {
  vi.resetAllMocks();
  mockEnqueueFormNotification.mockResolvedValue(null);
});

describe('generateInvitation', () => {
  it('rotates an expired invitation instead of returning a dead bearer token', async () => {
    const expired = {
      id: 'inv_expired',
      token: 'dead-token',
      formType: 'fellow-memorandum-v3',
      status: 'expired',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    mockPrisma.formInvitation.findUnique
      .mockResolvedValueOnce(expired as any)
      .mockResolvedValueOnce({ ...expired, token: 'fresh-token', status: 'pending' } as any);
    mockPrisma.formInvitation.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum-v3',
        enforceAppointmentType: false,
        triggeredBy: 'admin:test',
      })
    ).resolves.toMatchObject({ token: 'fresh-token', status: 'pending', created: false });

    expect(mockPrisma.formInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv_expired', token: 'dead-token', status: 'expired' },
      data: {
        token: expect.any(String),
        status: 'pending',
        submittedAt: null,
        expiresAt: expect.any(Date),
      },
    });
  });

  it('rejects a configured form when the appointment type is not mapped to it', async () => {
    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum-v3',
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
        formType: 'fellow-memorandum-v3',
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
        formType: 'fellow-memorandum-v3',
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
    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
  });

  it('creates a standard term fellow invitation when appointment and raw fellowship value match', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue(null);
    mockPrisma.formInvitation.create.mockResolvedValue({
      id: 'inv_term',
      token: 'term-token',
      formType: 'term-fellow-memorandum-v1',
      status: 'pending',
    } as any);

    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'term-fellow-memorandum-v1',
        appointmentType: 'Fellow (short Term)',
        fellowshipType: 'berenson_fellow',
        enforceAppointmentType: true,
        triggeredBy: 'admin:test',
      })
    ).resolves.toMatchObject({
      id: 'inv_term',
      token: 'term-token',
      formType: 'term-fellow-memorandum-v1',
      created: true,
    });

    expect(mockPrisma.formInvitation.create).toHaveBeenCalledWith({
      data: {
        token: expect.any(String),
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'term-fellow-memorandum-v1',
        expiresAt: expect.any(Date),
      },
    });
  });

  it('rejects a term form when the same appointment has a different raw fellowship value', async () => {
    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'term-fellow-memorandum-v1',
        appointmentType: 'Fellow (short Term)',
        fellowshipType: 'i_tatti_dumbarton_oaks_joint_fellow',
        enforceAppointmentType: true,
        triggeredBy: 'admin:test',
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 400,
      details: {
        code: 'no_form_configured',
        appointmentType: 'Fellow (short Term)',
        fellowshipType: 'i_tatti_dumbarton_oaks_joint_fellow',
        formType: 'term-fellow-memorandum-v1',
      },
    } satisfies Partial<ServiceError>);

    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
  });

  it('rejects an existing invitation when the current appointment mapping does not match', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_existing',
      token: 'existing-token',
      formType: 'fellow-memorandum-v3',
      status: 'pending',
    } as any);

    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum-v3',
        appointmentType: 'Visiting Professor',
        triggeredBy: 'admin:test',
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 400,
      details: {
        code: 'no_form_configured',
        appointmentType: 'Visiting Professor',
        formType: 'fellow-memorandum-v3',
      },
    });

    expect(mockPrisma.formInvitation.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
  });

  it('rejects retired form definitions for new link generation', async () => {
    await expect(
      generateInvitation({
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        formType: 'fellow-memorandum',
        appointmentType: 'Fellow',
        enforceAppointmentType: true,
        triggeredBy: 'admin:test',
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      statusCode: 400,
      details: {
        code: 'form_retired',
        formType: 'fellow-memorandum',
      },
    } satisfies Partial<ServiceError>);

    expect(mockPrisma.formInvitation.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.formInvitation.create).not.toHaveBeenCalled();
  });
});

describe('public invitation lifetime', () => {
  it('marks a pending invitation expired when its bearer link is read after expiry', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_expired',
      token: 'expired-token',
      formType: 'fellow-memorandum-v3',
      status: 'pending',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    } as any);
    mockPrisma.formInvitation.updateMany.mockResolvedValue({ count: 1 });

    await expect(getInvitationByToken('expired-token')).rejects.toMatchObject({
      statusCode: 410,
      message: 'This form link has expired',
    });
    expect(mockPrisma.formInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inv_expired',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
  });

  it('rejects submission through an expired bearer link before validating PII', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_expired',
      token: 'expired-token',
      formType: 'fellow-memorandum-v3',
      status: 'pending',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    } as any);
    mockPrisma.formInvitation.updateMany.mockResolvedValue({ count: 1 });

    await expect(submitForm('expired-token', {})).rejects.toMatchObject({
      statusCode: 410,
      message: 'This form link has expired',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an expired submitted bearer link without exposing submission metadata', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_submitted',
      token: 'legacy-submitted-token',
      formType: 'fellow-memorandum-v3',
      status: 'submitted',
      submittedAt: new Date('2025-01-01T00:00:00.000Z'),
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    } as any);

    await expect(getInvitationByToken('legacy-submitted-token')).rejects.toMatchObject({
      statusCode: 410,
      message: 'This form link has expired',
    });
  });

  it('atomically claims the same unexpired token before storing a response', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_pending',
      token: 'current-token',
      formType: 'fellow-memorandum-v3',
      status: 'pending',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    } as any);
    mockPrisma.formInvitation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.formResponse.create.mockResolvedValue({ id: 'response_1' } as any);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));

    await expect(submitForm('current-token', { firstName: 'Maria' })).resolves.toEqual({
      invitationId: 'inv_pending',
      responseId: 'response_1',
    });

    expect(mockPrisma.formInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inv_pending',
        token: 'current-token',
        status: 'pending',
        expiresAt: { gt: expect.any(Date) },
      },
      data: {
        status: 'submitted',
        submittedAt: expect.any(Date),
        token: expect.any(String),
      },
    });
    expect(mockPrisma.formResponse.create).toHaveBeenCalledWith({
      data: { invitationId: 'inv_pending', data: { firstName: 'Maria' } },
    });
    const claim = mockPrisma.formInvitation.updateMany.mock.calls[0]![0]!;
    expect(claim.data.token).not.toBe('current-token');
  });

  it('rejects an old bearer token when a concurrent reset rotates it', async () => {
    mockPrisma.formInvitation.findUnique
      .mockResolvedValueOnce({
        id: 'inv_reset',
        token: 'old-token',
        formType: 'fellow-memorandum-v3',
        status: 'pending',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      } as any)
      .mockResolvedValueOnce(null);
    mockPrisma.formInvitation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));

    await expect(submitForm('old-token', { firstName: 'Maria' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Invalid form link',
    });
    expect(mockPrisma.formResponse.create).not.toHaveBeenCalled();
  });

  it.each([
    ['submitted', new Date('2099-01-01T00:00:00.000Z'), 409, 'already been submitted'],
    ['pending', new Date('2026-01-01T00:00:00.000Z'), 410, 'link has expired'],
  ])(
    'reports a concurrent %s transition after the atomic claim fails',
    async (status, expiresAt, statusCode, message) => {
      const initial = {
        id: 'inv_raced',
        token: 'raced-token',
        formType: 'fellow-memorandum-v3',
        status: 'pending',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      };
      mockPrisma.formInvitation.findUnique
        .mockResolvedValueOnce(initial as any)
        .mockResolvedValueOnce({ ...initial, status, expiresAt } as any);
      mockPrisma.formInvitation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));

      await expect(submitForm('raced-token', {})).rejects.toMatchObject({
        statusCode,
        message: expect.stringContaining(message),
      });
      expect(mockPrisma.formResponse.create).not.toHaveBeenCalled();
    }
  );
});

describe('resetInvitation', () => {
  it('deletes any response and rotates the observed token in one transaction', async () => {
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_reset',
      token: 'old-token',
    } as any);
    mockPrisma.formResponse.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.formInvitation.update.mockResolvedValue({ id: 'inv_reset' } as any);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));

    const result = await resetInvitation('inv_reset', 'admin:test');

    expect(mockPrisma.formResponse.deleteMany).toHaveBeenCalledWith({
      where: { invitationId: 'inv_reset' },
    });
    expect(mockPrisma.formInvitation.update).toHaveBeenCalledWith({
      where: { id: 'inv_reset', token: 'old-token' },
      data: {
        token: expect.any(String),
        status: 'pending',
        submittedAt: null,
        expiresAt: expect.any(Date),
      },
    });
    expect(result.token).not.toBe('old-token');
    expect(mockPrisma.formInvitation.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.formResponse.deleteMany.mock.invocationCallOrder[0]
    );
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

    expect(mockPrisma.formInvitation.updateMany).toHaveBeenCalledWith({
      where: { status: 'pending', expiresAt: { lte: expect.any(Date) } },
      data: { status: 'expired' },
    });

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
