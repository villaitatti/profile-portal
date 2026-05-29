import { beforeEach, describe, expect, it, vi } from 'vitest';

type FormNotificationJob = {
  id: string;
  data: { invitationId: string; responseId: string };
};

type FormNotificationHandler = (jobs: FormNotificationJob[]) => Promise<void>;

const {
  bossSend,
  bossWork,
  generateFormPdfMock,
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
    generateFormPdfMock: vi.fn(),
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
  generateFormPdf: generateFormPdfMock,
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

import { registerFormNotificationWorker } from '../../workers/form-notification.worker.js';

describe('form notification worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workerState.handler = undefined;
    bossWork.mockImplementation((_queue: string, _options: unknown, handler: FormNotificationHandler) => {
      workerState.handler = handler;
      return Promise.resolve();
    });
  });

  it('generates the notification PDF from the submitted v2 form definition and sends it as the email attachment', async () => {
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
    const pdfBuffer = Buffer.from('generated-v2-form-pdf');

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
    generateFormPdfMock.mockResolvedValue(pdfBuffer);
    getFellowWithContactMock.mockResolvedValue({
      firstName: 'Maria',
      lastName: 'Bianchi',
    });
    sendFormNotificationEmailMock.mockResolvedValue(undefined);

    await registerFormNotificationWorker();
    expect(workerState.handler).toBeDefined();

    await workerState.handler!([
      { id: 'job_1', data: { invitationId: 'inv_1', responseId: 'resp_1' } },
    ]);

    expect(generateFormPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fellow-memorandum-v2' }),
      expect.objectContaining({
        legalStreetAddress: 'Via di Vincigliata 26',
        legalCity: 'Florence',
        legalPostalCode: '50135',
        legalStateProvince: 'FI',
        legalCountry: 'Italy',
      })
    );
    expect(sendFormNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formTitle: 'Memorandum I Tatti Fellowship',
        fellowshipId: 123,
        contactId: 456,
        academicYear: '2026-2027',
        pdfBuffer,
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
});
