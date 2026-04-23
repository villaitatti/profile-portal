import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import {
  renderVitIdInvitation,
  renderBioProjectDescription,
} from '../templates/render.js';

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
  /**
   * Friendly sender name. Rendered into SES `Source` as
   *   "<fromName> <AWS_SES_FROM_EMAIL>"
   * Email clients display this in the inbox. Undefined falls back to the
   * raw from-address, which shows up as "no-reply@mail.itatti.harvard.edu"
   * and signals "automated" to the recipient.
   */
  fromName?: string;
  /**
   * HTML body for multipart/alternative delivery. When provided alongside
   * the required plaintext `body`, SES sends BOTH as Body.Html + Body.Text
   * and the client picks whichever it can render. Omit to send plaintext-only.
   */
  html?: string;
}

function buildSesSource(fromName?: string): string {
  const address = env.AWS_SES_FROM_EMAIL!;
  if (!fromName) return address;
  // Quote the display name per RFC 5322. Also scrub any embedded " or \n
  // that would break the header.
  const safe = fromName.replace(/[\r\n"]/g, '');
  return `"${safe}" <${address}>`;
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
      {
        to,
        subject,
        bccAddresses: options?.bccAddresses,
        fromName: options?.fromName,
        hasHtml: !!options?.html,
        bodyLength: body.length,
      },
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

  // Body shape: plaintext-only when html is absent, multipart/alternative
  // (HTML + plaintext fallback) when html is provided.
  const messageBody = options?.html
    ? {
        Text: { Data: body, Charset: 'UTF-8' },
        Html: { Data: options.html, Charset: 'UTF-8' },
      }
    : {
        Text: { Data: body, Charset: 'UTF-8' },
      };

  const command = new SendEmailCommand({
    Source: buildSesSource(options?.fromName),
    Destination: {
      ToAddresses: [to],
      ...(options?.bccAddresses?.length ? { BccAddresses: options.bccAddresses } : {}),
    },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: messageBody,
    },
  });

  const result = await client.send(command);
  logger.info(
    {
      to,
      subject,
      bccAddresses: options?.bccAddresses,
      fromName: options?.fromName,
      hasHtml: !!options?.html,
      messageId: result?.MessageId,
    },
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

/**
 * Computes the appointee-email delivery envelope: actual `to`, BCC list,
 * and whether a redirect is active. Shared by the VIT ID invitation and
 * bio emails so both paths honor APPOINTEE_EMAIL_REDIRECT_TO identically.
 *
 * A redirect is in effect whenever APPOINTEE_EMAIL_REDIRECT_TO is set,
 * even if it happens to equal the intended recipient. Basing the flag on
 * actualTo !== to would silently re-enable production BCCs whenever a
 * developer's test redirect address matches the real appointee's address.
 *
 * Redirect is ALL-OR-NOTHING: if APPOINTEE_EMAIL_REDIRECT_TO is set on a
 * staging box that also inherits a production APPOINTEE_EMAIL_BCC (Angela
 * + Andrea), the BCC list would otherwise leak test emails to real admins.
 * Drop BCCs entirely when redirected.
 */
function buildAppointeeEnvelope(
  to: string,
  label: 'VIT ID invitation' | 'bio'
): { actualTo: string; bccAddresses: string[]; isRedirected: boolean } {
  const redirectTarget = env.APPOINTEE_EMAIL_REDIRECT_TO?.trim();
  const isRedirected = !!redirectTarget;
  const actualTo = redirectTarget || to;
  const bccAddresses = isRedirected ? [] : parseBccList(env.APPOINTEE_EMAIL_BCC);

  if (isRedirected) {
    logger.info(
      {
        intended: to,
        redirectedTo: actualTo,
        droppedBcc: parseBccList(env.APPOINTEE_EMAIL_BCC).length,
      },
      `${label} email redirected via APPOINTEE_EMAIL_REDIRECT_TO (BCC list dropped)`
    );
  }

  return { actualTo, bccAddresses, isRedirected };
}

/**
 * Sends the "Biography and Project Description" email to an Appointee.
 * Returns the SES MessageId when delivered, or undefined in dev/no-config mode.
 *
 * Honors env knobs:
 *   - APPOINTEE_EMAIL_REDIRECT_TO: if set, overrides the recipient (dev/staging
 *     safety valve; production refuses to boot with it set).
 *   - APPOINTEE_EMAIL_BCC: comma-separated BCC list.
 *   - APPOINTEE_EMAIL_FROM_NAME_BIO: inbox display name (default "I Tatti - Bio & Project").
 *
 * Body is rendered from the MJML template at compile time; this function
 * dispatches HTML + plaintext fallback via SES multipart/alternative.
 */
export async function sendBioProjectDescriptionEmail(args: {
  to: string;
  firstName: string;
}): Promise<{ messageId: string | undefined }> {
  const { to, firstName } = args;
  const { actualTo, bccAddresses } = buildAppointeeEnvelope(to, 'bio');
  const rendered = renderBioProjectDescription({ firstName });

  const messageId = await sendEmail(actualTo, rendered.subject, rendered.text, {
    bccAddresses: bccAddresses.length > 0 ? bccAddresses : undefined,
    fromName: env.APPOINTEE_EMAIL_FROM_NAME_BIO,
    html: rendered.html,
  });

  return { messageId };
}

/**
 * Sends the VIT ID invitation email — Angela clicks Send after the fellowship
 * is accepted, the appointee receives step-by-step claim instructions plus
 * a prominent "Claim your VIT ID" CTA that links to CLAIM_VIT_ID_URL.
 *
 * Throws TemplateRenderError('missing_first_name') when the CiviCRM contact
 * is missing a first name (route handlers map this to a structured UI error).
 *
 * Honors the same env knobs as sendBioProjectDescriptionEmail plus:
 *   - APPOINTEE_EMAIL_FROM_NAME_VIT_ID: inbox display name (default "I Tatti - VIT ID").
 *   - CLAIM_VIT_ID_URL: interpolated into the CTA button and plaintext link.
 */
export async function sendVitIdInvitationEmail(args: {
  to: string;
  firstName: string;
}): Promise<{ messageId: string | undefined }> {
  const { to, firstName } = args;
  const { actualTo, bccAddresses } = buildAppointeeEnvelope(
    to,
    'VIT ID invitation'
  );
  const rendered = renderVitIdInvitation({ firstName });

  const messageId = await sendEmail(actualTo, rendered.subject, rendered.text, {
    bccAddresses: bccAddresses.length > 0 ? bccAddresses : undefined,
    fromName: env.APPOINTEE_EMAIL_FROM_NAME_VIT_ID,
    html: rendered.html,
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
