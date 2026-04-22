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

/**
 * Appointee-facing email requires only the SES basics (region + FROM).
 * Used for bio/project-description emails and any future user-facing mail.
 */
export function isAppointeeEmailConfigured(): boolean {
  return !!(env.AWS_SES_REGION && env.AWS_SES_FROM_EMAIL);
}

/**
 * Admin-notification email requires SES basics PLUS a valid ADMIN_NOTIFICATION_EMAIL
 * recipient. Decoupled from appointee config so that a missing admin recipient
 * never silently blocks appointee deliveries.
 */
export function isAdminNotificationEmailConfigured(): boolean {
  return isAppointeeEmailConfigured() && !!env.ADMIN_NOTIFICATION_EMAIL;
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
  // Dev mode: log only, no SES touched. Returning undefined is fine because
  // the dev-mode short-circuit in the route/dispatch path is what guarantees
  // "would send" semantics — NOT this function's return value.
  if (isDevMode) {
    logger.info(
      { to, subject, bccAddresses: options?.bccAddresses, bodyLength: body.length },
      'Email (dev mode): would send'
    );
    logger.debug({ body }, 'Email body');
    return undefined;
  }

  // Outside dev mode, refuse to claim success when SES is misconfigured.
  // Previously this returned undefined silently, which caused dispatchOne()
  // to mark appointee events SENT even though no mail ever left the server.
  if (!isAppointeeEmailConfigured()) {
    throw new Error(
      'SES not configured: AWS_SES_REGION and AWS_SES_FROM_EMAIL are required to send email in production'
    );
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

interface ClaimNeedsReconciliationInput {
  claimantEmail: string;
  reason:
    | 'name-collision'
    | 'tier-conflict'
    | 'primary-conflict'
    | 'duplicate-civicrm-contact'
    | 'auth0-collision'
    // Informational (not a data bug): returning fellow matched via civicrm_id,
    // password reset sent to their OLD Auth0 email. IT should intervene if
    // the claimant reports not receiving it (they may no longer control the
    // old mailbox).
    | 'returning-fellow-reset-sent';
  candidates: {
    userId: string;
    email: string;
    civicrmId: string | null;
    name: string | null;
  }[];
  // Populated when the reason is 'duplicate-civicrm-contact' — the
  // contactIds of the duplicate CiviCRM contacts IT needs to merge.
  civicrmContactIds?: number[];
  // Populated when the reason is 'returning-fellow-reset-sent' — the email
  // we sent the reset to (the OLD Auth0 email, not the claimant's current).
  resetSentTo?: string;
}

/**
 * IT-facing notification triggered when a VIT ID claim hits a needs-review
 * state (duplicate CiviCRM contact, name collision, tier conflict, etc.)
 * and the claim flow refuses to auto-provision. IT reconciles manually.
 */
export async function sendClaimNeedsReconciliationNotification(
  input: ClaimNeedsReconciliationInput
): Promise<void> {
  const isReturningFellow = input.reason === 'returning-fellow-reset-sent';
  const subject = isReturningFellow
    ? `I Tatti Profile Portal — Returning Fellow Claim (password reset sent to old email)`
    : `I Tatti Profile Portal — VIT ID Claim Needs Manual Reconciliation (${input.reason})`;

  const lines: string[] = [];
  if (isReturningFellow) {
    lines.push(
      `A returning fellow tried to claim a VIT ID under a new email address. The match ladder found their existing Auth0 account via civicrm_id, and a password reset was sent to their OLD Auth0 email.`
    );
    lines.push('');
    lines.push(`Claimant typed email (new): ${input.claimantEmail}`);
    if (input.resetSentTo) {
      lines.push(`Password reset sent to (old Auth0 email): ${input.resetSentTo}`);
    }
    if (input.candidates.length > 0) {
      const c = input.candidates[0];
      lines.push(`Matched Auth0 account: user_id ${c.userId}, name ${c.name ?? '—'}, civicrm_id ${c.civicrmId ?? '—'}`);
    }
    lines.push('');
    lines.push(
      `No action is required unless the claimant reports not receiving the reset email. If they no longer control the old mailbox, update the Auth0 account's primary email to the new address manually.`
    );
  } else {
    lines.push(`A VIT ID claim could not be processed automatically — the match ladder found ambiguous candidates.`);
    lines.push('');
    lines.push(`Claimant email: ${input.claimantEmail}`);
    lines.push(`Reason: ${input.reason}`);
    lines.push('');
    if (input.civicrmContactIds && input.civicrmContactIds.length > 0) {
      lines.push(`CiviCRM contact IDs sharing this email: ${input.civicrmContactIds.join(', ')}`);
      lines.push(`→ Use CiviCRM's "Find and Merge Duplicate Contacts" tool.`);
      lines.push('');
    }
    if (input.candidates.length > 0) {
      lines.push(`Candidate Auth0 accounts:`);
      for (const c of input.candidates) {
        lines.push(`  • ${c.email}  (user_id: ${c.userId}, name: ${c.name ?? '—'}, civicrm_id: ${c.civicrmId ?? '—'})`);
      }
      lines.push('');
    }
    lines.push(
      `No Auth0 account was created. Please investigate and either merge the duplicates or manually provision the correct VIT ID for the claimant.`
    );
  }
  const body = lines.join('\n');

  if (!isAdminNotificationEmailConfigured()) {
    logger.warn(
      { subject, reason: input.reason },
      'Skipping claim-needs-reconciliation email: ADMIN_NOTIFICATION_EMAIL (or SES) not configured'
    );
    return;
  }

  try {
    await sendEmail(env.ADMIN_NOTIFICATION_EMAIL!, subject, body);
  } catch (err) {
    logger.error({ err, reason: input.reason }, 'Failed to send claim-needs-reconciliation email');
  }
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

  if (!isAdminNotificationEmailConfigured()) {
    logger.warn(
      { subject },
      'Skipping claim notification email: ADMIN_NOTIFICATION_EMAIL (or SES) not configured'
    );
    return;
  }

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

  // A redirect is in effect whenever APPOINTEE_EMAIL_REDIRECT_TO is set,
  // even if it happens to equal the intended recipient. Basing the flag on
  // actualTo !== to would silently re-enable production BCCs whenever a
  // developer's test redirect address matches the real appointee's address.
  const redirectTarget = env.APPOINTEE_EMAIL_REDIRECT_TO?.trim();
  const isRedirected = !!redirectTarget;
  const actualTo = redirectTarget || to;

  // Redirect must be ALL-OR-NOTHING: if a developer sets
  // APPOINTEE_EMAIL_REDIRECT_TO on a staging box that also inherits a
  // production APPOINTEE_EMAIL_BCC (Angela + Andrea), the BCC list would
  // otherwise leak test emails to real admins. Drop BCCs entirely when
  // redirected.
  const bccAddresses = isRedirected ? [] : parseBccList(env.APPOINTEE_EMAIL_BCC);

  if (isRedirected) {
    logger.info(
      { intended: to, redirectedTo: actualTo, droppedBcc: parseBccList(env.APPOINTEE_EMAIL_BCC).length },
      'Bio email redirected via APPOINTEE_EMAIL_REDIRECT_TO (BCC list dropped)'
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

  if (!isAdminNotificationEmailConfigured()) {
    logger.warn(
      { subject },
      'Skipping automation report email: ADMIN_NOTIFICATION_EMAIL (or SES) not configured'
    );
    return;
  }

  try {
    await sendEmail(env.ADMIN_NOTIFICATION_EMAIL!, subject, body);
  } catch (err) {
    logger.error({ err }, 'Failed to send automation report email');
  }
}
