import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AppointeeEmailStatus } from '@prisma/client';

vi.mock('../../env.js', () => ({
  env: {
    AUTH0_FELLOWS_ROLE_ID: 'test-role',
    APPOINTEE_EMAIL_BCC: 'angela@itatti.harvard.edu,it@itatti.harvard.edu',
    CLAIM_VIT_ID_URL: 'https://claim.test.example/claim',
    PORTAL_PUBLIC_URL: 'https://portal.test.example',
    APPOINTEE_EMAIL_FROM_NAME_VIT_ID: 'I Tatti - VIT ID',
    APPOINTEE_EMAIL_FROM_NAME_BIO: 'I Tatti - Bio & Project',
  },
  isDevMode: false,
}));

vi.mock('../../services/civicrm.service.js', () => ({
  getContactById: vi.fn(),
  findContactIdByAnyEmail: vi.fn(),
  getEmailsForContacts: vi.fn(),
}));

vi.mock('../../services/auth0.service.js', () => ({
  listUsersByRole: vi.fn(),
}));

vi.mock('../../services/appointee-email.service.js', () => ({
  sendBioEmailManually: vi.fn(),
  sendVitIdInvitationManually: vi.fn(),
}));

vi.mock('../../services/fellows.service.js', () => ({
  getFellowsDashboard: vi.fn(),
}));

vi.mock('../../templates/render.js', async () => {
  // Re-import the real TemplateRenderError class so `instanceof` checks work,
  // but mock out the render functions.
  const actual = await vi.importActual<
    typeof import('../../templates/render.js')
  >('../../templates/render.js');
  return {
    ...actual,
    renderVitIdInvitation: vi.fn(),
    renderBioProjectDescription: vi.fn(),
  };
});

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { fellowsAdminRoutes } from '../../routes/fellows-admin.routes.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as appointeeEmailService from '../../services/appointee-email.service.js';
import * as render from '../../templates/render.js';
import { TemplateRenderError } from '../../templates/render.js';

const mockCivicrm = vi.mocked(civicrmService);
const mockAppointee = vi.mocked(appointeeEmailService);
const mockRender = vi.mocked(render);

function makeApp() {
  const app = express();
  app.use(express.json());
  // Stub the auth middleware: every request is a staff-it user.
  app.use((req, _res, next) => {
    (req as any).userId = 'test-user';
    next();
  });
  app.use('/api/admin/fellows', fellowsAdminRoutes);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/admin/fellows/:contactId/send-vit-id-email', () => {
  it('returns 400 invalid_request when contactId is not a positive integer', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/abc/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 invalid_request when body fails schema validation', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: 'not-a-year' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.details).toBeDefined();
  });

  it('returns 503 with reason civicrm_unavailable when CiviCRM is down (distinguishes from 400 eligibility errors)', async () => {
    // This 503-vs-400 split is a review-driven decision from codex 2026-04-23:
    // the modal surfaces "CiviCRM is temporarily unavailable. Try again in a
    // moment." for transient upstream failures, rather than a generic error.
    mockAppointee.sendVitIdInvitationManually.mockResolvedValue({
      ok: false,
      reason: 'civicrm_unavailable',
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('civicrm_unavailable');
  });

  it('returns 400 with reason for other ineligibility codes', async () => {
    mockAppointee.sendVitIdInvitationManually.mockResolvedValue({
      ok: false,
      reason: 'already_has_vit_id',
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('already_has_vit_id');
  });

  it('returns 400 with reason needs_review when match ladder is ambiguous (defense in depth)', async () => {
    mockAppointee.sendVitIdInvitationManually.mockResolvedValue({
      ok: false,
      reason: 'needs_review',
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('needs_review');
  });

  it('returns 502 with reason email_send_failed when SES rejects the VIT invitation', async () => {
    mockAppointee.sendVitIdInvitationManually.mockResolvedValue({
      ok: false,
      reason: 'email_send_failed',
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(502);
    expect(res.body.reason).toBe('email_send_failed');
  });

  it('returns 200 with eventId/status/sentAt on success', async () => {
    const sentAt = new Date('2026-04-23T12:00:00Z');
    mockAppointee.sendVitIdInvitationManually.mockResolvedValue({
      ok: true,
      eventId: 'evt_ok',
      status: AppointeeEmailStatus.SENT,
      sentAt,
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      eventId: 'evt_ok',
      status: 'SENT',
      sentAt: sentAt.toISOString(),
    });
  });

  it('passes the caller userId into triggeredBy for audit logging', async () => {
    mockAppointee.sendVitIdInvitationManually.mockResolvedValue({
      ok: true,
      eventId: 'evt_ok',
      status: AppointeeEmailStatus.SENT,
      sentAt: new Date(),
    });
    const app = makeApp();
    await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    const call = mockAppointee.sendVitIdInvitationManually.mock.calls[0][0];
    expect(call.triggeredBy).toBe('admin_manual:test-user');
  });

  it('returns 500 internal_error when the service throws unexpectedly', async () => {
    mockAppointee.sendVitIdInvitationManually.mockRejectedValue(
      new Error('boom')
    );
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-vit-id-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('POST /api/admin/fellows/:contactId/send-bio-email', () => {
  it('returns 503 with reason civicrm_unavailable when CiviCRM is down', async () => {
    mockAppointee.sendBioEmailManually.mockResolvedValue({
      ok: false,
      reason: 'civicrm_unavailable',
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-bio-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('civicrm_unavailable');
  });

  it('returns 502 with reason email_send_failed when SES rejects the bio email', async () => {
    mockAppointee.sendBioEmailManually.mockResolvedValue({
      ok: false,
      reason: 'email_send_failed',
    });
    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/fellows/1/send-bio-email')
      .send({ academicYear: '2026-2027' });
    expect(res.status).toBe(502);
    expect(res.body.reason).toBe('email_send_failed');
  });

  it('passes resend=true into the manual bio send service', async () => {
    mockAppointee.sendBioEmailManually.mockResolvedValue({
      ok: true,
      eventId: 'evt_resend',
      status: AppointeeEmailStatus.SENT,
      sentAt: new Date('2026-04-24T12:00:00Z'),
    });
    const app = makeApp();
    await request(app)
      .post('/api/admin/fellows/1/send-bio-email')
      .send({ academicYear: '2026-2027', resend: true });

    expect(mockAppointee.sendBioEmailManually).toHaveBeenCalledWith({
      contactId: 1,
      academicYear: '2026-2027',
      triggeredBy: 'admin_manual:test-user',
      resend: true,
    });
  });
});

describe('GET /api/admin/fellows/:contactId/email-preview', () => {
  it('returns 400 invalid_request when contactId is not a positive integer', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/abc/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 invalid_request when the type query param is not a known enum', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'unknown_type', academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 invalid_request when academicYear is not consecutive', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2025-2030' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 404 with reason contact_not_found when the CiviCRM contact does not exist', async () => {
    mockCivicrm.getContactById.mockResolvedValue(null);
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2026-2027' });
    expect(res.status).toBe(404);
    // Reason-key envelope (not { error }) so the web client's useEmailPreview
    // maps this into EmailPreviewError. See EmailPreviewReason in @itatti/shared.
    expect(res.body.reason).toBe('contact_not_found');
  });

  it('returns 400 with reason no_primary_email when the contact has no email', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: '',
    });
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('no_primary_email');
  });

  it('maps TemplateRenderError to 400 {reason} so the modal can show an actionable message', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: '', // missing → template renderer throws
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockRender.renderVitIdInvitation.mockImplementation(() => {
      throw new TemplateRenderError('missing_first_name');
    });
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2026-2027' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('missing_first_name');
  });

  it('returns the rendered preview envelope (to, bcc, subject, html body) on the VIT happy path', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockRender.renderVitIdInvitation.mockReturnValue({
      subject: 'Welcome to I Tatti — Claim your VIT ID',
      html: '<p>Dear Sofia,</p>',
      text: 'Dear Sofia,',
    });
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2026-2027' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      to: 'sofia@example.com',
      bcc: ['angela@itatti.harvard.edu', 'it@itatti.harvard.edu'],
      subject: 'Welcome to I Tatti — Claim your VIT ID',
      body: '<p>Dear Sofia,</p>',
      bodyFormat: 'html',
    });
  });

  it('routes type=bio_project_description to renderBioProjectDescription', async () => {
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Marco',
      lastName: 'Rossi',
      email: 'marco@example.com',
    });
    mockRender.renderBioProjectDescription.mockReturnValue({
      subject: 'Biography and Project Description',
      html: '<p>Dear Marco,</p>',
      text: 'Dear Marco,',
    });
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'bio_project_description', academicYear: '2026-2027' });
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Biography and Project Description');
    // Strict branching: the VIT renderer must NOT be called for bio requests.
    expect(mockRender.renderVitIdInvitation).not.toHaveBeenCalled();
    expect(mockRender.renderBioProjectDescription).toHaveBeenCalled();
  });

  it('always returns bcc as an array (never undefined) — the modal needs a stable shape', async () => {
    // Guard for the web-side type contract: EmailPreviewModalProps declares
    // bcc as string[], and the modal renders "(none)" when length is 0.
    // undefined would crash. The top-level route test covers the populated
    // case; this one just asserts the type invariant on the response shape.
    mockCivicrm.getContactById.mockResolvedValue({
      id: 1,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockRender.renderVitIdInvitation.mockReturnValue({
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
    });
    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/fellows/1/email-preview')
      .query({ type: 'vit_id_invitation', academicYear: '2026-2027' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bcc)).toBe(true);
  });
});
