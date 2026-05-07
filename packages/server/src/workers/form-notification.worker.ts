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
  const jobId = await boss.send(QUEUE_NAMES.FORM_SUBMISSION_NOTIFICATION, payload);
  if (!jobId) {
    // pg-boss.send() returns null (no throw) when the queue doesn't exist
    // or when a dedup/throttle rule suppresses the insert. For our
    // form-submission flow neither of those is expected — log loudly so a
    // future regression surfaces instead of silently dropping emails.
    logger.error(
      { payload, queue: QUEUE_NAMES.FORM_SUBMISSION_NOTIFICATION },
      'form notification: boss.send returned null — job not enqueued, no email will be sent'
    );
  }
  return jobId;
}

export async function registerFormNotificationWorker(): Promise<void> {
  const boss = await getJobQueue();

  // Queue creation is handled centrally by getJobQueue() for EVERY
  // QUEUE_NAMES.* value, so a send() that races worker registration still
  // finds a valid queue row. See packages/server/src/lib/job-queue.ts.
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
