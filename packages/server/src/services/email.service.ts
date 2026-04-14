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

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (isDevMode || !isEmailConfigured()) {
    logger.info({ to, subject, bodyLength: body.length }, 'Email (dev mode/not configured): would send');
    logger.debug({ body }, 'Email body');
    return;
  }

  // Lazy import + cached client to avoid loading AWS SDK in dev mode
  const client = await getSesClient();
  const { SendEmailCommand } = await import('@aws-sdk/client-ses');
  const command = new SendEmailCommand({
    Source: env.AWS_SES_FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  });

  await client.send(command);
  logger.info({ to, subject }, 'Email sent via SES');
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
