import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', () => ({
  env: {},
  isDevMode: false,
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    formInvitation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    formResponse: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../services/civicrm.service.js', () => ({
  getFellowsWithContacts: vi.fn(),
  getFellowWithContact: vi.fn(),
}));

vi.mock('../../services/form-pdf.service.js', () => ({
  FORM_PDF_KINDS: [
    { kind: 'memorandum', label: 'Memorandum' },
    { kind: 'grants-resources', label: 'Grant Information' },
  ],
  generateFormPdf: vi.fn(),
  getFormPdfKindLabel: vi.fn((_formDef, kind) =>
    kind === 'grants-resources' ? 'Grant Information' : 'Memorandum'
  ),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from '../../lib/prisma.js';
import * as civicrmService from '../../services/civicrm.service.js';
import { generateFormPdf } from '../../services/form-pdf.service.js';

const mockPrisma = vi.mocked(prisma, true);
const mockCivicrm = vi.mocked(civicrmService);
const mockGenerateFormPdf = vi.mocked(generateFormPdf);

// Per-test fresh route module so the module-scoped fellows cache
// (cachedFellows / cachedFellowsExpires) does not leak between tests.
// A warmed cache from one test would mask the CiviCRM-throws path in
// another, which is exactly what we need to exercise separately.
let formsAdminRoutes: express.Router;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  // Re-register mocks after resetModules (resetModules clears the registry
  // of all previously-imported modules including their mocks).
  vi.doMock('../../env.js', () => ({ env: {}, isDevMode: false }));
  vi.doMock('../../lib/prisma.js', () => ({ prisma }));
  vi.doMock('../../services/civicrm.service.js', () => civicrmService);
  vi.doMock('../../services/form-pdf.service.js', () => ({
    FORM_PDF_KINDS: [
      { kind: 'memorandum', label: 'Memorandum' },
      { kind: 'grants-resources', label: 'Grant Information' },
    ],
    generateFormPdf: mockGenerateFormPdf,
    getFormPdfKindLabel: vi.fn((_formDef, kind) =>
      kind === 'grants-resources' ? 'Grant Information' : 'Memorandum'
    ),
  }));
  vi.doMock('../../lib/logger.js', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  }));
  const mod = await import('../../routes/forms-admin.routes.js');
  formsAdminRoutes = mod.formsAdminRoutes;
});

describe('GET /api/admin/forms/response/:invitationId/pdf/:pdfKind', () => {
  it('generates the requested split PDF with metadata', async () => {
    const pdf = Buffer.from('%PDF memorandum');
    mockPrisma.formInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      formType: 'fellow-memorandum-v3',
      response: {
        id: 'r_1',
        data: {
          givenName: 'Maria',
          surname: 'Bianchi',
          mobilePhone: '+39 333 0000',
        },
        createdAt: new Date('2026-04-24T10:00:00Z'),
      },
    } as any);
    mockCivicrm.getFellowWithContact.mockResolvedValue({
      firstName: 'Maria',
      lastName: 'Bianchi',
      fellowship: 'Fellow',
      appointment: 'Research Fellow',
    } as any);
    mockGenerateFormPdf.mockResolvedValue(pdf);

    const res = await request(makeApp())
      .get('/api/admin/forms/response/inv_1/pdf/memorandum')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain('Memorandum');
    expect(res.body).toEqual(pdf);
    expect(mockGenerateFormPdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fellow-memorandum-v3' }),
      expect.objectContaining({ givenName: 'Maria', surname: 'Bianchi' }),
      {
        kind: 'memorandum',
        metadata: {
          appointeeName: 'Maria Bianchi',
          academicYear: '2026-2027',
          fellowshipType: 'Fellow',
          appointment: 'Research Fellow',
        },
      }
    );
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'test-user';
    next();
  });
  app.use('/api/admin/forms', formsAdminRoutes);
  return app;
}

const baseInvitation = {
  id: 'inv_1',
  token: 'tok_1',
  fellowshipId: 10,
  contactId: 100,
  academicYear: '2026-2027',
  formType: 'fellow-memorandum',
  status: 'submitted',
  nominationSentAt: null,
  submittedAt: new Date('2026-04-24T10:00:00Z'),
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-24T10:00:00Z'),
  response: { id: 'r_1', data: {}, createdAt: new Date('2026-04-24T10:00:00Z') },
};

describe('GET /api/admin/forms/invitations — bearer + route wiring', () => {
  it('returns { items, facets } with contactName joined from CiviCRM', async () => {
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseInvitation] as any) // items
      .mockResolvedValueOnce([
        { academicYear: '2026-2027', formType: 'fellow-memorandum' },
      ] as any); // facet rows

    mockCivicrm.getFellowsWithContacts.mockResolvedValue([
      {
        contactId: 100,
        firstName: 'Maria',
        lastName: 'Bianchi',
        email: 'maria@example.com',
        fellowshipId: 10,
        startDate: '2026-09-01',
        endDate: '2027-06-01',
      } as any,
    ]);

    const res = await request(makeApp())
      .get('/api/admin/forms/invitations?status=submitted')
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('facets');
    expect(res.body.items[0]).toMatchObject({
      id: 'inv_1',
      contactName: 'Maria Bianchi',
      formTitle: 'Memorandum I Tatti Fellowship',
      hasResponse: true,
    });
    expect(res.body.facets.academicYears).toEqual(['2026-2027']);
  });

  it('does NOT include invitation tokens in the archive response (security invariant)', async () => {
    // Regression guard: tokens are the key to the unauthenticated public
    // form endpoint (GET /api/forms/:token returns response data). The admin
    // archive MUST NOT leak them — admin actions use invitation id, not the
    // token. If this field ever reappears in the response mapping, any
    // screenshot or leak of the admin page exposes every submission's PII
    // via the public endpoint.
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseInvitation] as any)
      .mockResolvedValueOnce([
        { academicYear: '2026-2027', formType: 'fellow-memorandum' },
      ] as any);
    mockCivicrm.getFellowsWithContacts.mockResolvedValue([]);

    const res = await request(makeApp())
      .get('/api/admin/forms/invitations?status=submitted')
      .expect(200);

    for (const item of res.body.items) {
      expect(item).not.toHaveProperty('token');
    }
  });

  it('degrades gracefully when CiviCRM throws — returns 200 with contactName: null', async () => {
    // Design decision A4. When CiviCRM is unreachable, the route's
    // buildNameLookup try/catch logs a warning and returns a lookup whose
    // getName() always returns null. Items still make it to the client with
    // contactId intact, and the UI renders "Contact #<id>" as a fallback.
    //
    // This test runs against a fresh module import (beforeEach's
    // vi.resetModules) so the 120s fellows cache starts empty.
    mockPrisma.formInvitation.findMany
      .mockResolvedValueOnce([baseInvitation] as any)
      .mockResolvedValueOnce([
        { academicYear: '2026-2027', formType: 'fellow-memorandum' },
      ] as any);

    mockCivicrm.getFellowsWithContacts.mockRejectedValue(
      new Error('CiviCRM unreachable')
    );

    const res = await request(makeApp())
      .get('/api/admin/forms/invitations?status=submitted')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].contactName).toBeNull();
    expect(res.body.items[0].contactId).toBe(100);
    expect(res.body.items[0].formTitle).toBe('Memorandum I Tatti Fellowship');
  });
});
