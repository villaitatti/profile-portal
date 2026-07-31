import { beforeEach, describe, expect, it, vi } from 'vitest';

type FormNotificationJob = {
  id: string;
  data: { invitationId: string; responseId: string };
};

type FormNotificationHandler = (jobs: FormNotificationJob[]) => Promise<void>;

const {
  bossSend,
  bossWork,
  generateFormPdfAttachmentsMock,
  getFellowWithContactMock,
  loggerMock,
  mockPrisma,
  sendFormNotificationEmailMock,
  workerState,
} = vi.hoisted(() => {
  const workerState: {
    handler?: FormNotificationHandler;
  } = {};

  return {
    bossSend: vi.fn(),
    bossWork: vi.fn((_queue: string, _options: unknown, handler: FormNotificationHandler) => {
      workerState.handler = handler;
      return Promise.resolve();
    }),
    generateFormPdfAttachmentsMock: vi.fn(),
    getFellowWithContactMock: vi.fn(),
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    mockPrisma: {
      formInvitation: {
        findUnique: vi.fn(),
      },
    },
    sendFormNotificationEmailMock: vi.fn(),
    workerState,
  };
});

vi.mock('../../lib/job-queue.js', () => ({
  QUEUE_NAMES: { FORM_SUBMISSION_NOTIFICATION: 'form-submission-notification' },
  getJobQueue: vi.fn(async () => ({ send: bossSend, work: bossWork })),
}));

vi.mock('../../services/form-pdf.service.js', () => ({
  generateFormPdfAttachments: generateFormPdfAttachmentsMock,
}));

vi.mock('../../services/email.service.js', () => ({
  sendFormNotificationEmail: sendFormNotificationEmailMock,
}));

vi.mock('../../services/civicrm.service.js', () => ({
  getFellowWithContact: getFellowWithContactMock,
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: loggerMock,
}));

import {
  enqueueFormNotification,
  registerFormNotificationWorker,
} from '../../workers/form-notification.worker.js';

describe('form notification worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workerState.handler = undefined;
    bossWork.mockImplementation((_queue: string, _options: unknown, handler: FormNotificationHandler) => {
      workerState.handler = handler;
      return Promise.resolve();
    });
  });

  it('generates split notification PDFs from the submitted v2 form definition and sends them as email attachments', async () => {
    const responseData = {
      givenName: 'Maria',
      surname: 'Bianchi',
      email: 'maria@example.com',
      legalStreetAddress: 'Via di Vincigliata 26',
      legalCity: 'Florence',
      legalPostalCode: '50135',
      legalStateProvince: 'FI',
      legalCountry: 'Italy',
      countryMovingFrom: 'Italy',
      hasUsSsn: 'No',
      statusAtItatti: 'Independent Scholar',
      nationality: 'Italian',
      emergencyName: 'Luca Bianchi',
      emergencyPhone: '+39 055 0000',
      emergencyEmail: 'luca@example.com',
      resources: 'University leave letter attached.',
    };
    const pdfAttachments = [
      { kind: 'memorandum', label: 'Memorandum', buffer: Buffer.from('memorandum-pdf') },
      {
        kind: 'grants-resources',
        label: 'Grants & Resources',
        buffer: Buffer.from('grants-pdf'),
      },
    ];

    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_1',
      fellowshipId: 123,
      contactId: 456,
      academicYear: '2026-2027',
      formType: 'fellow-memorandum-v2',
      response: {
        id: 'resp_1',
        data: responseData,
      },
    });
    generateFormPdfAttachmentsMock.mockResolvedValue(pdfAttachments);
    getFellowWithContactMock.mockResolvedValue({
      firstName: 'Maria',
      lastName: 'Bianchi',
      fellowship: 'Fellow',
      appointment: 'Research Fellow',
    });
    sendFormNotificationEmailMock.mockResolvedValue(undefined);

    await registerFormNotificationWorker();
    expect(workerState.handler).toBeDefined();

    await workerState.handler!([
      { id: 'job_1', data: { invitationId: 'inv_1', responseId: 'resp_1' } },
    ]);

    expect(generateFormPdfAttachmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fellow-memorandum-v2' }),
      expect.objectContaining({
        legalStreetAddress: 'Via di Vincigliata 26',
        legalCity: 'Florence',
        legalPostalCode: '50135',
        legalStateProvince: 'FI',
        legalCountry: 'Italy',
      }),
      {
        appointeeName: 'Maria Bianchi',
        academicYear: '2026-2027',
        fellowshipType: 'Fellow',
        appointment: 'Research Fellow',
      }
    );
    expect(sendFormNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formTitle: 'Memorandum I Tatti Fellowship',
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        pdfAttachments,
        responseData: expect.objectContaining({
          legalStreetAddress: 'Via di Vincigliata 26',
          legalCity: 'Florence',
          legalPostalCode: '50135',
          legalStateProvince: 'FI',
          legalCountry: 'Italy',
        }),
        appointeeName: 'Maria Bianchi',
      })
    );
  });

  // The two silent-failure modes in this pipeline. Both produce a missing email
  // with no exception anywhere, which is how the pg-boss v10 createQueue
  // regression survived a full release cycle.

  it('logs an ERROR when boss.send returns null rather than dropping the email silently', async () => {
    // pg-boss returns null (no throw) from send() when the queue does not exist
    // — exactly the v10 createQueue regression. Nothing downstream notices.
    bossSend.mockResolvedValue(null);

    const jobId = await enqueueFormNotification({
      invitationId: 'inv_1',
      responseId: 'resp_1',
    });

    expect(jobId).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][1]).toMatch(/not enqueued/i);
  });

  it('returns the job id and stays quiet on a successful enqueue', async () => {
    bossSend.mockResolvedValue('job_1');

    await expect(
      enqueueFormNotification({ invitationId: 'inv_1', responseId: 'resp_1' })
    ).resolves.toBe('job_1');
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('logs and rethrows a handler failure so an eventually-dropped job is discoverable', async () => {
    // pg-boss absorbs a handler throw: the job moves to `failed` and is retried
    // per retryLimit, but no application log is emitted and the boss `error`
    // event does not fire for handler failures. A deterministic failure (a PDF
    // that never renders for one submission's data) therefore exhausts its
    // retries and vanishes, recoverable only by querying pgboss.job by hand.
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      id: 'inv_1',
      fellowshipId: 123,
      contactId: 456,
      academicYear: '2026-2027',
      formType: 'fellow-memorandum-v2',
      response: { id: 'resp_1', data: {} },
    });
    getFellowWithContactMock.mockResolvedValue(null);
    generateFormPdfAttachmentsMock.mockRejectedValue(new Error('pdf render blew up'));

    await registerFormNotificationWorker();

    // Rethrown, so retry semantics are unchanged.
    await expect(
      workerState.handler!([
        { id: 'job_1', data: { invitationId: 'inv_1', responseId: 'resp_1' } },
      ])
    ).rejects.toThrow('pdf render blew up');

    const messages = loggerMock.error.mock.calls.map((c) => c[1] as string);
    expect(messages.some((m) => /form notification job failed/i.test(m))).toBe(true);
    expect(sendFormNotificationEmailMock).not.toHaveBeenCalled();
  });

  it('skips a vanished invitation without failing the job', async () => {
    // Not retryable — the invitation is gone. Warn and let the job complete
    // rather than burning retries and then disappearing.
    mockPrisma.formInvitation.findUnique.mockResolvedValue(null);

    await registerFormNotificationWorker();

    await expect(
      workerState.handler!([
        { id: 'job_1', data: { invitationId: 'gone', responseId: 'resp_1' } },
      ])
    ).resolves.toBeUndefined();

    expect(sendFormNotificationEmailMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});
