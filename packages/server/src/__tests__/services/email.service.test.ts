import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE importing the service so isDevMode resolves.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    AWS_SES_REGION: 'us-east-1',
    AWS_SES_FROM_EMAIL: 'noreply@itatti.harvard.edu',
    APPOINTEE_EMAIL_REDIRECT_TO: '',
    APPOINTEE_EMAIL_BCC: 'angela@itatti.harvard.edu,it@itatti.harvard.edu',
    APPOINTEE_EMAIL_FROM_NAME_VIT_ID: 'I Tatti - VIT ID',
    APPOINTEE_EMAIL_FROM_NAME_BIO: 'I Tatti - Bio & Project',
    CLAIM_VIT_ID_URL: 'https://claim.test.example/claim',
    PORTAL_PUBLIC_URL: 'https://portal.test.example',
    FORM_NOTIFICATION_EMAIL: 'forms@itatti.harvard.edu',
    FORM_NOTIFICATION_OVERRIDE_TO: '',
    ADMIN_NOTIFICATION_EMAIL: '',
  },
}));

vi.mock('../../env.js', () => ({
  env: mockEnv,
  isDevMode: false,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock @aws-sdk/client-ses at the dynamic-import boundary. email.service lazily
// imports SESClient and SendEmailCommand, so we mock both.
const { sesSend, SendEmailCommandMock, SendRawEmailCommandMock } = vi.hoisted(() => ({
  sesSend: vi.fn(),
  SendEmailCommandMock: vi.fn(function (this: any, input: any) {
    this.input = input;
  }),
  SendRawEmailCommandMock: vi.fn(function (this: any, input: any) {
    this.input = input;
  }),
}));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: function () {
    return { send: sesSend };
  },
  SendEmailCommand: SendEmailCommandMock,
  SendRawEmailCommand: SendRawEmailCommandMock,
}));

import {
  sendVitIdInvitationEmail,
  sendBioProjectDescriptionEmail,
  sendFormNotificationEmail,
  sendMissedAutomationAlert,
  sendDailyDispatchFailureAlert,
  sendAutomationReport,
} from '../../services/email.service.js';

beforeEach(() => {
  // Reset to the default env between tests so mutation in one test does not
  // leak into the next. Uses Object.assign rather than reassignment so the
  // mock reference stays live.
  Object.assign(mockEnv, {
    AWS_SES_REGION: 'us-east-1',
    AWS_SES_FROM_EMAIL: 'noreply@itatti.harvard.edu',
    APPOINTEE_EMAIL_REDIRECT_TO: '',
    APPOINTEE_EMAIL_BCC: 'angela@itatti.harvard.edu,it@itatti.harvard.edu',
    APPOINTEE_EMAIL_FROM_NAME_VIT_ID: 'I Tatti - VIT ID',
    APPOINTEE_EMAIL_FROM_NAME_BIO: 'I Tatti - Bio & Project',
    CLAIM_VIT_ID_URL: 'https://claim.test.example/claim',
    PORTAL_PUBLIC_URL: 'https://portal.test.example',
    FORM_NOTIFICATION_EMAIL: 'forms@itatti.harvard.edu',
    FORM_NOTIFICATION_OVERRIDE_TO: '',
    ADMIN_NOTIFICATION_EMAIL: '',
  });
  sesSend.mockReset();
  SendEmailCommandMock.mockClear();
  SendRawEmailCommandMock.mockClear();
  sesSend.mockResolvedValue({ MessageId: 'ses-default' });
});

describe('sendVitIdInvitationEmail', () => {
  it('dispatches multipart/alternative (HTML + plaintext) via SES', async () => {
    const result = await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });

    expect(result.messageId).toBe('ses-default');
    expect(sesSend).toHaveBeenCalledOnce();
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    // Body carries BOTH Text and Html so spam-filter fallbacks and corporate
    // HTML-stripping inboxes both render correctly.
    expect(cmd.Message.Body).toHaveProperty('Text');
    expect(cmd.Message.Body).toHaveProperty('Html');
    expect(cmd.Message.Body.Text.Data).toContain('Dear Sofia,');
    expect(cmd.Message.Body.Html.Data).toContain('Dear Sofia,');
    expect(cmd.Message.Subject.Data).toBe(
      'Welcome to I Tatti — Claim your VIT ID'
    );
  });

  it('renders the friendly From name in the SES Source header', async () => {
    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    // Display name is quoted per RFC 5322 so the em-dash and spaces are safe.
    expect(cmd.Source).toBe('"I Tatti - VIT ID" <noreply@itatti.harvard.edu>');
  });

  it('scrubs CR/LF/quote characters from fromName (SES header-injection guard)', async () => {
    // SIMULATE an attacker-controlled from-name containing header-injection
    // characters. If buildSesSource did not scrub, an attacker who controlled
    // the env value (or, later, a per-contact display name fed from CiviCRM)
    // could inject BCC / Return-Path / Subject headers via the display name.
    mockEnv.APPOINTEE_EMAIL_FROM_NAME_VIT_ID =
      'Evil"\r\nBcc: attacker@example.com\r\n';

    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    // The Source MUST NOT contain CR, LF, or unescaped quotes inside the
    // display name — those would terminate the header and let the injected
    // content start a new header. All three characters are scrubbed.
    expect(cmd.Source).not.toContain('\r');
    expect(cmd.Source).not.toContain('\n');
    // Opening quote is MANDATORY (wraps the display name), closing quote is
    // MANDATORY (terminates the display name). Between them, no internal
    // quotes allowed.
    const match = cmd.Source.match(/^"([^"]*)" <.+>$/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain('"');
    // The Bcc: fragment is sanitized — it's part of the scrubbed display name
    // now, not a dangling header.
    expect(cmd.Source).not.toMatch(/^Bcc:/im);
  });

  it('sends to the intended recipient WITH BCC when APPOINTEE_EMAIL_REDIRECT_TO is empty', async () => {
    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Destination.ToAddresses).toEqual(['sofia@example.com']);
    expect(cmd.Destination.BccAddresses).toEqual([
      'angela@itatti.harvard.edu',
      'it@itatti.harvard.edu',
    ]);
  });

  it('redirects to APPOINTEE_EMAIL_REDIRECT_TO AND drops the BCC list (all-or-nothing)', async () => {
    mockEnv.APPOINTEE_EMAIL_REDIRECT_TO = 'dev@test.local';

    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    // Recipient is the redirect target, NOT the intended sofia@example.com.
    expect(cmd.Destination.ToAddresses).toEqual(['dev@test.local']);
    // CRITICAL: BCC list MUST be dropped. A regression here would CC real
    // production admins (Angela, IT) on every staging test send.
    expect(cmd.Destination.BccAddresses).toBeUndefined();
  });

  it('drops BCC under redirect EVEN IF the redirect address equals the intended recipient', async () => {
    // Basing the drop on actualTo !== to would silently re-enable production
    // BCCs whenever a developer's redirect happens to match the real appointee.
    // The drop is based on whether the redirect env is SET, not on the address
    // comparison. This test is a guard against a subtle future regression.
    mockEnv.APPOINTEE_EMAIL_REDIRECT_TO = 'sofia@example.com';

    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Destination.BccAddresses).toBeUndefined();
  });

  it('omits BCC when APPOINTEE_EMAIL_BCC is empty', async () => {
    mockEnv.APPOINTEE_EMAIL_BCC = '';

    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Destination.BccAddresses).toBeUndefined();
  });

  it('trims and filters whitespace / empty entries in the BCC list', async () => {
    mockEnv.APPOINTEE_EMAIL_BCC =
      '  angela@itatti.harvard.edu  , ,it@itatti.harvard.edu,';

    await sendVitIdInvitationEmail({
      to: 'sofia@example.com',
      firstName: 'Sofia',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Destination.BccAddresses).toEqual([
      'angela@itatti.harvard.edu',
      'it@itatti.harvard.edu',
    ]);
  });
});

describe('sendBioProjectDescriptionEmail', () => {
  it('dispatches multipart/alternative (HTML + plaintext) via SES', async () => {
    await sendBioProjectDescriptionEmail({
      to: 'marco@example.com',
      firstName: 'Marco',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Message.Body).toHaveProperty('Text');
    expect(cmd.Message.Body).toHaveProperty('Html');
    expect(cmd.Message.Body.Text.Data).toContain('Dear Marco,');
    expect(cmd.Message.Body.Html.Data).toContain('Dear Marco,');
    expect(cmd.Message.Subject.Data).toBe('Biography and Project Description');
  });

  it('uses the bio-specific From display name', async () => {
    await sendBioProjectDescriptionEmail({
      to: 'marco@example.com',
      firstName: 'Marco',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Source).toBe(
      '"I Tatti - Bio & Project" <noreply@itatti.harvard.edu>'
    );
  });

  it('falls back to "Appointee" when firstName is blank (preserves prior plaintext behavior)', async () => {
    await sendBioProjectDescriptionEmail({
      to: 'marco@example.com',
      firstName: '',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Message.Body.Text.Data).toContain('Dear Appointee,');
    expect(cmd.Message.Body.Html.Data).toContain('Dear Appointee,');
  });

  it('honors the redirect + BCC-drop semantics identically to the VIT invitation', async () => {
    mockEnv.APPOINTEE_EMAIL_REDIRECT_TO = 'dev@test.local';

    await sendBioProjectDescriptionEmail({
      to: 'marco@example.com',
      firstName: 'Marco',
    });
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Destination.ToAddresses).toEqual(['dev@test.local']);
    expect(cmd.Destination.BccAddresses).toBeUndefined();
  });
});

describe('sendFormNotificationEmail', () => {
  it('sends the generated PDF buffers as form notification attachments', async () => {
    const memorandumPdf = Buffer.from('generated-memorandum-pdf-containing-v3-form-fields');
    const grantsPdf = Buffer.from('generated-grants-resources-pdf-containing-v3-form-fields');

    await sendFormNotificationEmail({
      formTitle: 'Memorandum I Tatti Fellowship',
      fellowshipId: 123,
      contactId: 456,
      academicYear: '2026-2027',
      pdfAttachments: [
        { label: 'Memorandum', buffer: memorandumPdf },
        { label: 'Grant Information', buffer: grantsPdf },
      ],
      responseData: {
        legalStreetAddress: 'Via di Vincigliata 26',
        legalCity: 'Florence',
        legalCountry: 'Italy',
      },
      appointeeName: 'Maria Bianchi',
    });

    expect(sesSend).toHaveBeenCalledOnce();
    expect(SendRawEmailCommandMock).toHaveBeenCalledOnce();

    const cmd = SendRawEmailCommandMock.mock.calls[0][0];
    const rawMessage = Buffer.from(cmd.RawMessage.Data).toString('utf8');
    const normalizedRawMessage = rawMessage.replace(/\r?\n/g, '');

    expect(rawMessage).toContain('To: forms@itatti.harvard.edu');
    expect(rawMessage.match(/Content-Type: application\/pdf/g)).toHaveLength(2);
    expect(rawMessage).toContain('Memorandum_I_Tatti_Fellowship_Memorandum_Maria_Bianchi.pdf');
    expect(rawMessage).toContain('Memorandum_I_Tatti_Fellowship_Grant_Information_Maria_Bianchi.pdf');
    expect(normalizedRawMessage).toContain(memorandumPdf.toString('base64'));
    expect(normalizedRawMessage).toContain(grantsPdf.toString('base64'));
  });
});

describe('sendMissedAutomationAlert', () => {
  it('sends under an alert subject — never the success-sounding "… Complete"', async () => {
    // Regression: the missed-run incident used to reuse sendAutomationReport,
    // whose subject hardcodes a "Complete" suffix, so a NEVER-COMPLETED
    // automation arrived looking like a success.
    mockEnv.ADMIN_NOTIFICATION_EMAIL = 'it@itatti.harvard.edu';

    await sendMissedAutomationAlert({
      type: 'end-of-year-cleanup',
      academicYear: '2026-2027',
      details: ['The scheduled end-of-year-cleanup automation appears to have NEVER COMPLETED.'],
    });

    expect(sesSend).toHaveBeenCalledOnce();
    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Message.Subject.Data).toBe(
      'I Tatti Profile Portal — ALERT: July 1 Current Appointees Cleanup was NOT completed for 2026-2027'
    );
    expect(cmd.Destination.ToAddresses).toEqual(['it@itatti.harvard.edu']);
  });

  it('never throws — an unconfigured admin recipient only logs', async () => {
    mockEnv.ADMIN_NOTIFICATION_EMAIL = '';

    await expect(
      sendMissedAutomationAlert({
        type: 'new-cohort-onboarding',
        academicYear: '2026-2027',
        details: [],
      })
    ).resolves.toBeUndefined();
    expect(sesSend).not.toHaveBeenCalled();
  });
});

describe('sendAutomationReport outcome subjects', () => {
  // Regression: the subject hardcoded a "Complete" suffix, so the July cron's
  // failure report and a partial run both arrived looking like a success.
  it.each([
    [undefined, 'I Tatti Profile Portal Automation — July 1 Current Appointees Cleanup Complete'],
    ['completed', 'I Tatti Profile Portal Automation — July 1 Current Appointees Cleanup Complete'],
    [
      'partial',
      'I Tatti Profile Portal Automation — July 1 Current Appointees Cleanup PARTIALLY Complete — action needed',
    ],
    [
      'failed',
      'I Tatti Profile Portal Automation — July 1 Current Appointees Cleanup FAILED — action needed',
    ],
  ] as const)('outcome %s renders in the subject', async (outcome, expectedSubject) => {
    mockEnv.ADMIN_NOTIFICATION_EMAIL = 'it@itatti.harvard.edu';

    await sendAutomationReport({
      type: 'end-of-year-cleanup',
      academicYear: '2026-2027',
      processed: 1,
      pending: 0,
      errors: outcome === 'completed' || outcome === undefined ? 0 : 1,
      details: [],
      ...(outcome ? { outcome } : {}),
    });

    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Message.Subject.Data).toBe(expectedSubject);
  });
});

describe('sendDailyDispatchFailureAlert', () => {
  it('renders the last run counts when the dispatch resolved with failures', async () => {
    mockEnv.ADMIN_NOTIFICATION_EMAIL = 'it@itatti.harvard.edu';

    await sendDailyDispatchFailureAlert({
      consecutiveFailures: 3,
      lastRunCounts: { processed: 4, sent: 1, skipped: 0, failed: 2, deferred: 1, reclaimed: 0 },
    });

    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Message.Body.Text.Data).toContain('failed 3 days in a row');
    expect(cmd.Message.Body.Text.Data).toContain(
      'processed 4, sent 1, skipped 0, failed 2, deferred 1, reclaimed 0'
    );
  });

  it('renders the thrown error when the dispatch threw outright', async () => {
    mockEnv.ADMIN_NOTIFICATION_EMAIL = 'it@itatti.harvard.edu';

    await sendDailyDispatchFailureAlert({
      consecutiveFailures: 6,
      lastError: 'SES exploded',
    });

    const cmd = SendEmailCommandMock.mock.calls[0][0];
    expect(cmd.Message.Body.Text.Data).toContain('Most recent error: SES exploded');
    expect(cmd.Message.Body.Text.Data).not.toContain('Most recent run counts');
  });
});
