import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import {
  renderVitIdInvitation,
  renderBioProjectDescription,
  renderFormNotification,
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

export interface FormNotificationEmailInput {
  /** Also used as the "Fellowship" label in the subject and body. */
  formTitle: string;
  /** Kept for diagnostic logging only — never rendered into the email. */
  fellowshipId: number;
  /** Kept for diagnostic logging only — never rendered into the email. */
  contactId: number;
  academicYear: string;
  pdfBuffer: Buffer;
  /**
   * Retained in the interface for potential future consumers; intentionally
   * NOT rendered into the email body anymore. The PDF attachment carries
   * every field; duplicating it into plaintext leaked submitted data into
   * inbox previews and server logs.
   */
  responseData: Record<string, unknown>;
  /**
   * Resolved by the worker from CiviCRM. Null when the lookup fails — in
   * that case the email still ships with degraded subject + body (no
   * "Appointee:" line).
   */
  appointeeName: string | null;
}

/**
 * Strip every character that can end an SMTP/MIME header line. Covers
 * ASCII CR/LF/HT/NUL/C0 plus Unicode "line separator" flavours that some
 * MIME parsers and mail clients treat as newlines when folding or
 * re-encoding: U+0085 (NEL), U+2028 (LINE SEP), U+2029 (PARA SEP).
 * Defense lives here (at the SMTP boundary) — any untrusted string that
 * reaches sendFormNotificationEmail is scrubbed, so the function is safe
 * even if a future caller forgets to sanitise upstream.
 */
function sanitizeHeaderValue(v: string): string {
  return v.replace(/[\r\n\t\x00-\x1f\x7f\u0085\u2028\u2029]/g, ' ').trim();
}

/**
 * RFC 2047 encoded-word wrap for non-ASCII subject lines. If the value is
 * pure ASCII, return it unchanged. Otherwise UTF-8 + base64 + wrap per the
 * spec so real names like "François Élise" or "王小明" render correctly in
 * every mail client instead of arriving as mojibake.
 */
function encodeMimeWord(v: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  // RFC 2047 caps each encoded-word at 75 octets total, INCLUDING the
  // "=?UTF-8?B?...?=" wrapper (12 chars). So the base64 payload per token
  // is at most 63 chars, and must be a multiple of 4 to stay a valid
  // base64 quantum → 60. 60 base64 chars decode to 45 UTF-8 bytes.
  const base64 = Buffer.from(v, 'utf8').toString('base64');
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += 60) {
    chunks.push(`=?UTF-8?B?${base64.slice(i, i + 60)}?=`);
  }
  // Join with CRLF + SP so the long header folds per RFC 5322 §2.2.3.
  return chunks.join('\r\n ');
}

/**
 * RFC 2231 filename parameter for non-ASCII attachment filenames. Returns
 * a pair of Content-Disposition params: a plain ASCII-sanitised `filename=`
 * for legacy clients, plus `filename*=UTF-8''<percent-encoded>` for
 * anything modern. The ASCII fallback also uses the existing
 * alphanumeric-only sanitiser so older mail clients get a safe 8.3-style
 * name rather than the mojibake Mail.app shows when the UTF-8 version is
 * misparsed.
 */
function buildFilenameParams(stem: string, formTitle: string): {
  asciiFilename: string;
  utf8FilenameParam: string;
} {
  const asciiStem = stem.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'form-response';
  const asciiTitle = formTitle.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'form';
  const asciiFilename = `${asciiTitle}_${asciiStem}.pdf`;
  const utf8Filename = `${formTitle}_${stem}.pdf`;
  // encodeURIComponent leaves !'()* unescaped, but RFC 5987 uses the
  // single-quote as the ext-value delimiter — so a name like "O'Brien.pdf"
  // would produce a malformed filename*=UTF-8''O'Brien.pdf. Percent-encode
  // those five characters explicitly on top of encodeURIComponent.
  const utf8Encoded = encodeURIComponent(utf8Filename).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
  const utf8FilenameParam = `filename*=UTF-8''${utf8Encoded}`;
  return { asciiFilename, utf8FilenameParam };
}

export async function sendFormNotificationEmail(input: FormNotificationEmailInput): Promise<void> {
  const overrideTo = env.FORM_NOTIFICATION_OVERRIDE_TO?.trim();
  const formRecipient = env.FORM_NOTIFICATION_EMAIL?.trim();

  if (!overrideTo && !formRecipient) {
    logger.warn('Skipping form notification email: FORM_NOTIFICATION_EMAIL not configured');
    return;
  }

  const recipient = overrideTo || formRecipient!;

  // Scrub every untrusted string at the email-service boundary. Upstream
  // callers (worker) may also scrub, but the defense belongs here so this
  // exported function is safe regardless of who calls it.
  const safeName = input.appointeeName ? sanitizeHeaderValue(input.appointeeName) : null;
  const safeFormTitle = sanitizeHeaderValue(input.formTitle);
  const safeAcademicYear = sanitizeHeaderValue(input.academicYear);

  // Subject puts the distinguishing info (appointee name) first so it
  // survives inbox-column truncation. Non-ASCII names are RFC 2047
  // encoded-word wrapped so Italian/French/Chinese fellowship names
  // render correctly in every client (without this, SES either rejects
  // or the client shows mojibake).
  const subjectPlain = safeName
    ? `Form submitted by ${safeName} — ${safeFormTitle} (${safeAcademicYear})`
    : `Form submitted — ${safeFormTitle} (${safeAcademicYear})`;
  const subject = encodeMimeWord(subjectPlain);

  if (isDevMode && !overrideTo) {
    // Do NOT log the subject — it may now contain the appointee's full
    // name, which is PII the log aggregator has no business seeing. The
    // fellowshipId + pdfSize are enough to correlate with the worker's
    // 'form notification sent' line.
    logger.info(
      { fellowshipId: input.fellowshipId, pdfSize: input.pdfBuffer.length },
      'Form notification email (dev mode): would send with PDF attachment'
    );
    return;
  }

  if (!isAppointeeEmailConfigured()) {
    throw new Error('SES not configured for form notification');
  }

  const client = await getSesClient();
  const { SendRawEmailCommand } = await import('@aws-sdk/client-ses');

  const rendered = renderFormNotification({
    formTitle: safeFormTitle,
    academicYear: safeAcademicYear,
    appointeeName: safeName,
  });

  const mixedBoundary = `----=_Mixed_${Date.now()}`;
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Prefer appointee name in the filename (easier for Angela to find in her
  // inbox/attachments). Fall back to contactId when CiviCRM failed so we
  // never produce an ambiguous name.
  const filenameStem = safeName ?? String(input.contactId);
  const { asciiFilename, utf8FilenameParam } = buildFilenameParams(filenameStem, safeFormTitle);

  // Base64-encode both text and HTML bodies so non-ASCII content (e.g. a
  // form title with Italian diacritics) is transported safely.
  // Chunk to 76-char lines per RFC 2045.
  const bodyBase64 = Buffer.from(rendered.text, 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n');
  const htmlBase64 = Buffer.from(rendered.html, 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n');
  const rawMessage = [
    `From: ${buildSesSource()}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlBase64,
    ``,
    `--${altBoundary}--`,
    ``,
    `--${mixedBoundary}`,
    // Keep the ASCII filename= for legacy clients; add filename*= (RFC 2231)
    // for anything modern so "François_Élise.pdf" displays correctly instead
    // of collapsing to underscores. The `name=` param on Content-Type is
    // kept alongside for maximum compatibility.
    `Content-Type: application/pdf; name="${asciiFilename}"`,
    `Content-Disposition: attachment; filename="${asciiFilename}"; ${utf8FilenameParam}`,
    `Content-Transfer-Encoding: base64`,
    ``,
    input.pdfBuffer.toString('base64').replace(/.{76}(?=.)/g, '$&\r\n'),
    ``,
    `--${mixedBoundary}--`,
  ].join('\r\n');

  const command = new SendRawEmailCommand({
    RawMessage: { Data: Buffer.from(rawMessage) },
  });

  await client.send(command);
  // Deliberately NOT logging `subject` here — the post-v0.14.2 subject
  // contains the appointee's full name, which is PII that doesn't belong
  // in log aggregators. fellowshipId + recipient are enough to correlate
  // with upstream worker logs.
  logger.info(
    { fellowshipId: input.fellowshipId, to: recipient, overrideActive: !!overrideTo },
    'Form notification email sent'
  );
}
