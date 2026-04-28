import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', () => ({
  env: {
    APPOINTEE_EMAIL_BCC: 'angela@itatti.harvard.edu,it@itatti.harvard.edu',
    CLAIM_VIT_ID_URL: 'https://claim.test.example/claim',
    PORTAL_PUBLIC_URL: 'https://portal.test.example',
  },
  isDevMode: false,
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    appointeeEmailEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../services/civicrm.service.js', () => ({
  getFellowsWithContacts: vi.fn(),
  getContactById: vi.fn(),
}));

vi.mock('../../templates/render.js', async () => {
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

import { prisma } from '../../lib/prisma.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as render from '../../templates/render.js';
import { TemplateRenderError } from '../../templates/render.js';

const mockPrisma = vi.mocked(prisma, true);
const mockCivicrm = vi.mocked(civicrmService);
const mockRender = vi.mocked(render);

// Dynamic import so mocks are already in place
const { emailsAdminRoutes } = await import('../../routes/emails-admin.routes.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'test-user';
    next();
  });
  app.use('/api/admin/emails', emailsAdminRoutes);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── GET /api/admin/emails ───────────────────────────────────────────────────

describe('GET /api/admin/emails', () => {
  it('returns events with joined appointee names from CiviCRM', async () => {
    const now = new Date('2026-04-20T10:00:00Z');
    mockPrisma.appointeeEmailEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        fellowshipId: 101,
        contactId: 3,
        academicYear: '2025-2026',
        emailType: 'BIO_PROJECT_DESCRIPTION',
        status: 'SENT',
        enqueuedAt: now,
        sendAfter: now,
        sentAt: now,
        updatedAt: now,
        triggeredBy: 'claim_auto',
        failureReason: null,
        sesMessageId: 'ses-123',
      },
    ] as any);

    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      {
        contactId: 3,
        firstName: 'Sophie',
        lastName: 'Laurent',
        email: 'sophie@example.com',
        fellowshipId: 101,
        startDate: '2025-09-01',
        endDate: '2026-07-31',
      },
    ] as any);

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails');

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      id: 'evt-1',
      appointeeName: 'Sophie Laurent',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SENT',
      sesMessageId: 'ses-123',
    });
  });

  it('degrades gracefully when CiviCRM is unavailable (name shows "?")', async () => {
    const now = new Date('2026-04-20T10:00:00Z');
    mockPrisma.appointeeEmailEvent.findMany.mockResolvedValue([
      {
        id: 'evt-2',
        fellowshipId: 102,
        contactId: 5,
        academicYear: '2025-2026',
        emailType: 'VIT_ID_INVITATION',
        status: 'PENDING',
        enqueuedAt: now,
        sendAfter: now,
        sentAt: null,
        updatedAt: now,
        triggeredBy: 'admin_manual:auth0|andrea',
        failureReason: null,
        sesMessageId: null,
      },
    ] as any);

    mockCivicrm.getFellowsWithContacts.mockRejectedValue(new Error('CiviCRM down'));

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails');

    expect(res.status).toBe(200);
    expect(res.body.events[0].appointeeName).toBe('?');
  });

  it('serializes dates as ISO strings and null sentAt as null', async () => {
    const enqueued = new Date('2026-04-10T07:00:00Z');
    const updated = new Date('2026-04-10T08:00:00Z');
    mockPrisma.appointeeEmailEvent.findMany.mockResolvedValue([
      {
        id: 'evt-3',
        fellowshipId: 103,
        contactId: 6,
        academicYear: '2025-2026',
        emailType: 'BIO_PROJECT_DESCRIPTION',
        status: 'FAILED',
        enqueuedAt: enqueued,
        sendAfter: enqueued,
        sentAt: null,
        updatedAt: updated,
        triggeredBy: 'claim_auto',
        failureReason: 'SES rejected',
        sesMessageId: null,
      },
    ] as any);

    mockCivicrm.getFellowsWithContacts.mockResolvedValue([]);

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails');

    expect(res.status).toBe(200);
    expect(res.body.events[0].enqueuedAt).toBe('2026-04-10T07:00:00.000Z');
    expect(res.body.events[0].sentAt).toBeNull();
    expect(res.body.events[0].updatedAt).toBe('2026-04-10T08:00:00.000Z');
    expect(res.body.events[0].failureReason).toBe('SES rejected');
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.appointeeEmailEvent.findMany.mockRejectedValue(new Error('DB down'));

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails');

    expect(res.status).toBe(500);
  });
});

// ─── GET /api/admin/emails/:eventId/preview ──────────────────────────────────

describe('GET /api/admin/emails/:eventId/preview', () => {
  it('returns 404 when event does not exist', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/nonexistent/preview');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 503 when CiviCRM is unavailable for contact lookup', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      fellowshipId: 101,
      contactId: 3,
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: new Date(),
      sendAfter: new Date(),
      sentAt: new Date(),
      updatedAt: new Date(),
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    } as any);

    mockCivicrm.getContactById.mockRejectedValue(new Error('CiviCRM down'));

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-1/preview');

    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('civicrm_unavailable');
  });

  it('renders with placeholder name when contact is deleted (recipientStatus: contact_deleted)', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      fellowshipId: 101,
      contactId: 3,
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: new Date(),
      sendAfter: new Date(),
      sentAt: new Date(),
      updatedAt: new Date(),
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    } as any);

    mockCivicrm.getContactById.mockResolvedValue(null);
    mockRender.renderVitIdInvitation.mockReturnValue({
      subject: 'Welcome',
      html: '<p>Dear Appointee,</p>',
      text: 'Dear Appointee,',
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-1/preview');

    expect(res.status).toBe(200);
    expect(res.body.recipientStatus).toBe('contact_deleted');
    expect(res.body.bcc).toEqual(['angela@itatti.harvard.edu', 'it@itatti.harvard.edu']);
  });

  it('renders with placeholder name when firstName is empty for VIT_ID_INVITATION (recipientStatus: no_first_name)', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      fellowshipId: 101,
      contactId: 3,
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: new Date(),
      sendAfter: new Date(),
      sentAt: new Date(),
      updatedAt: new Date(),
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    } as any);

    mockCivicrm.getContactById.mockResolvedValue({
      id: 3,
      firstName: '   ',
      lastName: 'Rossi',
      email: 'test@example.com',
    });
    mockRender.renderVitIdInvitation.mockReturnValue({
      subject: 'Welcome',
      html: '<p>Dear Appointee,</p>',
      text: 'Dear Appointee,',
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-1/preview');

    expect(res.status).toBe(200);
    expect(res.body.recipientStatus).toBe('no_first_name');
  });

  it('renders VIT_ID_INVITATION template with contact firstName on happy path', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      fellowshipId: 101,
      contactId: 3,
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: new Date(),
      sendAfter: new Date(),
      sentAt: new Date(),
      updatedAt: new Date(),
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    } as any);

    mockCivicrm.getContactById.mockResolvedValue({
      id: 3,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });
    mockRender.renderVitIdInvitation.mockReturnValue({
      subject: 'Welcome to I Tatti',
      html: '<p>Dear Sofia,</p>',
      text: 'Dear Sofia,',
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-1/preview');

    expect(res.status).toBe(200);
    expect(res.body.recipientStatus).toBe('current');
    expect(res.body.subject).toBe('Welcome to I Tatti');
    expect(res.body.html).toBe('<p>Dear Sofia,</p>');
    expect(res.body.text).toBe('Dear Sofia,');
    expect(res.body.bcc).toEqual(['angela@itatti.harvard.edu', 'it@itatti.harvard.edu']);
    expect(mockRender.renderVitIdInvitation).toHaveBeenCalledWith({ firstName: 'Sofia' });
  });

  it('renders BIO_PROJECT_DESCRIPTION template correctly', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue({
      id: 'evt-2',
      fellowshipId: 102,
      contactId: 5,
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SENT',
      enqueuedAt: new Date(),
      sendAfter: new Date(),
      sentAt: new Date(),
      updatedAt: new Date(),
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    } as any);

    mockCivicrm.getContactById.mockResolvedValue({
      id: 5,
      firstName: 'Marco',
      lastName: 'Bianchi',
      email: 'marco@example.com',
    });
    mockRender.renderBioProjectDescription.mockReturnValue({
      subject: 'Bio & Project',
      html: '<p>Dear Marco,</p>',
      text: 'Dear Marco,',
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-2/preview');

    expect(res.status).toBe(200);
    expect(res.body.recipientStatus).toBe('current');
    expect(mockRender.renderBioProjectDescription).toHaveBeenCalledWith({ firstName: 'Marco' });
    expect(mockRender.renderVitIdInvitation).not.toHaveBeenCalled();
  });

  it('falls back to no_first_name when TemplateRenderError is thrown', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      fellowshipId: 101,
      contactId: 3,
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: new Date(),
      sendAfter: new Date(),
      sentAt: new Date(),
      updatedAt: new Date(),
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    } as any);

    mockCivicrm.getContactById.mockResolvedValue({
      id: 3,
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia@example.com',
    });

    // First call (in the try block) throws TemplateRenderError
    mockRender.renderVitIdInvitation
      .mockImplementationOnce(() => { throw new TemplateRenderError('missing_first_name'); })
      // Second call (in renderVitIdInvitationSafe) succeeds
      .mockReturnValueOnce({
        subject: 'Welcome',
        html: '<p>Dear Appointee,</p>',
        text: 'Dear Appointee,',
      });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-1/preview');

    expect(res.status).toBe(200);
    expect(res.body.recipientStatus).toBe('no_first_name');
  });

  it('returns 500 internal_error when an unexpected error is thrown', async () => {
    mockPrisma.appointeeEmailEvent.findUnique.mockRejectedValue(new Error('unexpected'));

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/evt-1/preview');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── GET /api/admin/emails/templates/:type/preview ───────────────────────────

describe('GET /api/admin/emails/templates/:type/preview', () => {
  it('renders vit-id-invitation template with hardcoded "Sofia" placeholder', async () => {
    mockRender.renderVitIdInvitation.mockReturnValue({
      subject: 'Welcome to I Tatti — Claim your VIT ID',
      html: '<p>Dear Sofia,</p>',
      text: 'Dear Sofia,',
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/templates/vit-id-invitation/preview');

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Welcome to I Tatti — Claim your VIT ID');
    expect(res.body.bcc).toEqual(['angela@itatti.harvard.edu', 'it@itatti.harvard.edu']);
    expect(mockRender.renderVitIdInvitation).toHaveBeenCalledWith({ firstName: 'Sofia' });
  });

  it('renders bio-project-description template with hardcoded "Marco" placeholder', async () => {
    mockRender.renderBioProjectDescription.mockReturnValue({
      subject: 'Biography and Project Description',
      html: '<p>Dear Marco,</p>',
      text: 'Dear Marco,',
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/templates/bio-project-description/preview');

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Biography and Project Description');
    expect(mockRender.renderBioProjectDescription).toHaveBeenCalledWith({ firstName: 'Marco' });
  });

  it('returns 404 for an unknown template type', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/templates/unknown-type/preview');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 500 internal_error when the template renderer throws', async () => {
    mockRender.renderVitIdInvitation.mockImplementation(() => {
      throw new Error('template crash');
    });

    const app = makeApp();
    const res = await request(app).get('/api/admin/emails/templates/vit-id-invitation/preview');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── Dev mode ────────────────────────────────────────────────────────────────

describe('Dev mode responses', () => {
  it('GET / returns mock events in dev mode', async () => {
    // Re-import with isDevMode=true. We need a separate describe for this.
    vi.resetModules();
    vi.doMock('../../env.js', () => ({
      env: { APPOINTEE_EMAIL_BCC: '' },
      isDevMode: true,
    }));
    vi.doMock('../../lib/prisma.js', () => ({
      prisma: { appointeeEmailEvent: { findMany: vi.fn(), findUnique: vi.fn() } },
    }));
    vi.doMock('../../services/civicrm.service.js', () => ({
      getFellowsWithContacts: vi.fn(),
      getContactById: vi.fn(),
    }));
    vi.doMock('../../templates/render.js', () => ({
      renderVitIdInvitation: vi.fn(),
      renderBioProjectDescription: vi.fn(),
      TemplateRenderError: class extends Error {},
    }));
    vi.doMock('../../lib/logger.js', () => ({
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));

    const { emailsAdminRoutes: devRoutes } = await import('../../routes/emails-admin.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/emails', devRoutes);

    const res = await request(app).get('/api/admin/emails');
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
    expect(res.body.events[0]).toHaveProperty('appointeeName');
    expect(res.body.events[0]).toHaveProperty('emailType');
  });
});
