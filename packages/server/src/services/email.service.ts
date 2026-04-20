import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';

interface ClaimNotificationInput {
  email: string;
  firstName: string;
  lastName: string;
  hasFellowship: boolean;
  hasCurrentFellowship: boolean;
  rolesAssigned: string[];
  claimedAt: Date;
}

interface AutomationReportInput {
  type: 'end-of-year-cleanup' | 'new-cohort-onboarding' | 'backfill';
  academicYear: string;
  processed: number;
  pending: number;
  errors: number;
  details: string[];
}

export function isEmailConfigured(): boolean {
  return !!(env.AWS_SES_REGION && env.AWS_SES_FROM_EMAIL && env.ADMIN_NOTIFICATION_EMAIL);
}

let cachedSesClient: any = null;
async function getSesClient() {
  if (!cachedSesClient) {
    const { SESClient } = await import('@aws-sdk/client-ses');
    cachedSesClient = new SESClient({ region: env.AWS_SES_REGION });
  }
  return cachedSesClient;
}

interface SendEmailOptions {
  bccAddresses?: string[];
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options?: SendEmailOptions
): Promise<string | undefined> {
  if (isDevMode || !isEmailConfigured()) {
    logger.info(
      { to, subject, bccAddresses: options?.bccAddresses, bodyLength: body.length },
      'Email (dev mode/not configured): would send'
    );
    logger.debug({ body }, 'Email body');
    return undefined;
  }

  // Lazy import + cached client to avoid loading AWS SDK in dev mode
  const client = await getSesClient();
  const { SendEmailCommand } = await import('@aws-sdk/client-ses');
  const command = new SendEmailCommand({
    Source: env.AWS_SES_FROM_EMAIL,
    Destination: {
      ToAddresses: [to],
      ...(options?.bccAddresses?.length ? { BccAddresses: options.bccAddresses } : {}),
    },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  });

  const result = await client.send(command);
  logger.info(
    { to, subject, bccAddresses: options?.bccAddresses, messageId: result?.MessageId },
    'Email sent via SES'
  );
  return result?.MessageId as string | undefined;
}

export async function sendClaimNotification(input: ClaimNotificationInput): Promise<void> {
  const status = input.hasCurrentFellowship ? 'Current Fellow' : input.hasFellowship ? 'Former Fellow' : 'No Fellowship';
  const subject = `I Tatti Profile Portal — VIT ID Claimed: ${input.firstName} ${input.lastName}`;
  const body = [
    `VIT ID Claimed`,
    ``,
    `Name: ${input.firstName} ${input.lastName}`,
    `Email: ${input.email}`,
    `Fellowship Status: ${status}`,
    `Roles Assigned: ${input.rolesAssigned.join(', ')}`,
    `Claimed At: ${input.claimedAt.toISOString()}`,
  ].join('\n');

  try {
    await sendEmail(env.ADMIN_NOTIFICATION_EMAIL!, subject, body);
  } catch (err) {
    logger.error({ err }, 'Failed to send claim notification email');
  }
}

const BIO_EMAIL_SUBJECT = 'Biography and Project Description';
const BIO_EMAIL_JSM_URL =
  'https://helpdesk.itatti.harvard.edu/servicedesk/customer/portal/4/group/5/create/10';
const BIO_EMAIL_EXAMPLE_URL = 'https://itatti.harvard.edu/people/giovanni-vito-distefano';

/**
 * Sends the "Biography and Project Description" email to an Appointee.
 * Returns the SES MessageId when delivered, or undefined in dev/no-config mode.
 *
 * Honors two env knobs:
 *   - APPOINTEE_EMAIL_REDIRECT_TO: if set, overrides the recipient (dev/staging
 *     safety valve; production refuses to boot with it set).
 *   - APPOINTEE_EMAIL_BCC: comma-separated BCC list (Angela + Andrea typically).
 */
export async function sendBioProjectDescriptionEmail(args: {
  to: string;
  firstName: string;
}): Promise<{ messageId: string | undefined }> {
  const { to, firstName } = args;
  const greetingName = firstName && firstName.trim().length > 0 ? firstName.trim() : 'Appointee';

  const actualTo = env.APPOINTEE_EMAIL_REDIRECT_TO || to;
  const bccAddresses = parseBccList(env.APPOINTEE_EMAIL_BCC);

  if (env.APPOINTEE_EMAIL_REDIRECT_TO && actualTo !== to) {
    logger.info(
      { intended: to, redirectedTo: actualTo },
      'Bio email redirected via APPOINTEE_EMAIL_REDIRECT_TO'
    );
  }

  const body = [
    `Dear ${greetingName},`,
    ``,
    `As an I Tatti appointee, you will be featured on the I Tatti website. To complete your page, we kindly ask you to submit the following materials:`,
    ``,
    `  • A short biography (maximum 760 characters)`,
    `  • A project description (maximum 1,500 characters)`,
    ``,
    `Both should be written in English, in the third person, and presented as complete sentences (please do not use bullet points).`,
    ``,
    `We would be grateful if you could submit your materials as soon as possible, by using the following link:`,
    BIO_EMAIL_JSM_URL,
    ``,
    `To log in, please use your VIT ID: enter your email address, click Next, then select Continue with single sign-on. If prompted, enter your email and VIT ID password to complete the process.`,
    ``,
    `If you would like to see an example of what we are looking for, please view this entry for one of this year's appointees:`,
    BIO_EMAIL_EXAMPLE_URL,
    ``,
    `Best regards,`,
    `I Tatti — The Harvard University Center for Italian Renaissance Studies`,
  ].join('\n');

  const messageId = await sendEmail(actualTo, BIO_EMAIL_SUBJECT, body, {
    bccAddresses: bccAddresses.length > 0 ? bccAddresses : undefined,
  });

  return { messageId };
}

function parseBccList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function sendAutomationReport(input: AutomationReportInput): Promise<void> {
  const typeLabels: Record<string, string> = {
    'end-of-year-cleanup': 'July 1 Current Appointees Cleanup',
    'new-cohort-onboarding': 'July 2 New Appointees Onboarding',
    'backfill': 'Backfill Existing Fellows',
  };

  const label = typeLabels[input.type] || input.type;
  const subject = `I Tatti Profile Portal Automation — ${label} Complete`;
  const body = [
    `${label} — Academic Year ${input.academicYear}`,
    ``,
    `Processed: ${input.processed}`,
    `Pending (no VIT ID): ${input.pending}`,
    `Errors: ${input.errors}`,
    ``,
    `Details:`,
    ...input.details.map((d) => `  - ${d}`),
  ].join('\n');

  try {
    await sendEmail(env.ADMIN_NOTIFICATION_EMAIL!, subject, body);
  } catch (err) {
    logger.error({ err }, 'Failed to send automation report email');
  }
}
