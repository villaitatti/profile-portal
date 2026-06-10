import { getJobQueue, QUEUE_NAMES } from '../lib/job-queue.js';
import {
  generateFormPdfAttachments,
  type FormPdfMetadata,
} from '../services/form-pdf.service.js';
import { sendFormNotificationEmail } from '../services/email.service.js';
import { getFellowWithContact } from '../services/civicrm.service.js';
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

        const responseData = invitation.response.data as Record<string, unknown>;

        // Resolve the appointee's human-readable name from CiviCRM so the
        // notification email can read as "submitted by Andrea Caselli"
        // instead of leaking internal fellowshipId/contactId. On any
        // CiviCRM failure, fall back to null — sendFormNotificationEmail
        // renders degraded subject/body variants in that case (no
        // "Appointee:" line) so the email still ships.
        let appointeeName: string | null = null;
        let fellowshipType: string | null = null;
        let appointment: string | null = null;
        try {
          const fellow = await getFellowWithContact(
            invitation.fellowshipId,
            invitation.contactId
          );
          if (fellow && fellow.firstName && fellow.lastName) {
            const name = `${fellow.firstName} ${fellow.lastName}`.trim();
            if (name) appointeeName = name;
          }
          fellowshipType = fellow?.fellowship ?? null;
          appointment = fellow?.appointment ?? null;
          // Note: the email service (sendFormNotificationEmail) is the
          // authoritative sanitiser for strings that reach SMTP headers —
          // it strips CR/LF/control chars and RFC 2047-encodes non-ASCII.
          // We pass the raw name through so that layer sees the value it
          // actually needs to sanitise.
        } catch (err) {
          logger.warn(
            { err, invitationId, fellowshipId: invitation.fellowshipId },
            'form notification: appointee name lookup failed — sending with degraded subject'
          );
        }

        const metadata: FormPdfMetadata = {
          appointeeName: responseName(responseData) ?? appointeeName,
          academicYear: invitation.academicYear,
          fellowshipType,
          appointment,
        };
        const pdfAttachments = await generateFormPdfAttachments(
          formDef,
          responseData,
          metadata
        );

        await sendFormNotificationEmail({
          formTitle: formDef.title,
          fellowshipId: invitation.fellowshipId,
          contactId: invitation.contactId,
          academicYear: invitation.academicYear,
          pdfAttachments,
          responseData,
          appointeeName: metadata.appointeeName,
        });

        logger.info({ invitationId, jobId: job.id }, 'form notification sent');
      }
    }
  );
}

function responseName(data: Record<string, unknown>): string | null {
  const givenName = typeof data.givenName === 'string' ? data.givenName.trim() : '';
  const surname = typeof data.surname === 'string' ? data.surname.trim() : '';
  const fullName = [givenName, surname].filter(Boolean).join(' ').trim();
  return fullName || null;
}
