import { getJobQueue, QUEUE_NAMES } from '../lib/job-queue.js';
import { generateFormPdf } from '../services/form-pdf.service.js';
import { sendFormNotificationEmail } from '../services/email.service.js';
import { prisma } from '../lib/prisma.js';
import { getFormDef } from '@itatti/shared';
import { logger } from '../lib/logger.js';

export interface FormSubmissionNotificationPayload {
  invitationId: string;
  responseId: string;
}

export async function enqueueFormNotification(
  payload: FormSubmissionNotificationPayload
): Promise<string | null> {
  const boss = await getJobQueue();
  return boss.send(QUEUE_NAMES.FORM_SUBMISSION_NOTIFICATION, payload);
}

export async function registerFormNotificationWorker(): Promise<void> {
  const boss = await getJobQueue();

  await boss.work<FormSubmissionNotificationPayload>(
    QUEUE_NAMES.FORM_SUBMISSION_NOTIFICATION,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { invitationId, responseId } = job.data;
        logger.info({ invitationId, responseId, jobId: job.id }, 'processing form notification');

        const invitation = await prisma.formInvitation.findUnique({
          where: { id: invitationId },
          include: { response: true },
        });

        if (!invitation || !invitation.response) {
          logger.warn({ invitationId }, 'form notification: invitation or response not found');
          continue;
        }

        const formDef = getFormDef(invitation.formType);
        if (!formDef) {
          logger.warn({ formType: invitation.formType }, 'form notification: form def not found');
          continue;
        }

        const pdfBuffer = await generateFormPdf(formDef, invitation.response.data as Record<string, unknown>);

        await sendFormNotificationEmail({
          formTitle: formDef.title,
          fellowshipId: invitation.fellowshipId,
          contactId: invitation.contactId,
          academicYear: invitation.academicYear,
          pdfBuffer,
          responseData: invitation.response.data as Record<string, unknown>,
        });

        logger.info({ invitationId, jobId: job.id }, 'form notification sent');
      }
    }
  );
}
