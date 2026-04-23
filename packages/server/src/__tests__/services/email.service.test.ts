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
const { sesSend, SendEmailCommandMock, SESClientMock } = vi.hoisted(() => ({
  sesSend: vi.fn(),
  SendEmailCommandMock: vi.fn(function (this: any, input: any) {
    this.input = input;
  }),
  SESClientMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: function () {
    return { send: sesSend };
  },
  SendEmailCommand: SendEmailCommandMock,
}));

import {
  sendVitIdInvitationEmail,
  sendBioProjectDescriptionEmail,
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
  });
  sesSend.mockReset();
  SendEmailCommandMock.mockClear();
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
