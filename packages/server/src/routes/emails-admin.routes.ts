import { Router } from 'express';
import { z } from 'zod';
import { env, isDevMode } from '../env.js';
import { prisma } from '../lib/prisma.js';
import * as civicrmService from '../services/civicrm.service.js';
import {
  renderVitIdInvitation,
  renderBioProjectDescription,
  TemplateRenderError,
} from '../templates/render.js';
import { logger } from '../lib/logger.js';
import type { AppointeeEmailType } from '@prisma/client';

const router = Router();

let cachedFellows: { contactId: number; firstName: string; lastName: string }[] | null = null;
let cachedFellowsExpires = 0;
const FELLOWS_CACHE_TTL_MS = 120_000;

async function getFellowsCached() {
  const now = Date.now();
  if (cachedFellows && now < cachedFellowsExpires) return cachedFellows;
  const fellows = await civicrmService.getFellowsWithContacts();
  cachedFellows = fellows;
  cachedFellowsExpires = now + FELLOWS_CACHE_TTL_MS;
  return fellows;
}

interface EmailEventRow {
  id: string;
  fellowshipId: number;
  contactId: number;
  appointeeName: string;
  academicYear: string;
  emailType: AppointeeEmailType;
  status: string;
  enqueuedAt: string;
  sentAt: string | null;
  updatedAt: string;
  triggeredBy: string;
  failureReason: string | null;
  sesMessageId: string | null;
}

// GET /api/admin/emails
// Returns email events with joined appointee names. Supports cursor-based pagination
// and server-side filtering by year, type, and status.
const VALID_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  cursor: z.string().optional(),
  year: z.string().optional(),
  type: z.enum(['BIO_PROJECT_DESCRIPTION', 'VIT_ID_INVITATION']).optional(),
  status: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    if (isDevMode) {
      res.json({ events: getDevMockEvents(), nextCursor: null });
      return;
    }

    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    const { limit, cursor, year, type, status } = query.data;

    const where: Record<string, unknown> = {};
    if (year) where.academicYear = year;
    if (type) where.emailType = type;
    if (status) {
      const statuses = status.split(',').filter(Boolean);
      const invalid = statuses.filter((s) => !(VALID_STATUSES as readonly string[]).includes(s));
      if (invalid.length > 0) {
        res.status(400).json({ error: 'invalid_status' });
        return;
      }
      if (statuses.length === 1) where.status = statuses[0];
      else if (statuses.length > 1) where.status = { in: statuses };
    }

    const events = await prisma.appointeeEmailEvent.findMany({
      where,
      take: limit + 1,
      orderBy: [{ enqueuedAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    let nameMap: Map<number, string>;
    try {
      const fellows = await getFellowsCached();
      nameMap = new Map(
        fellows.map((f) => [f.contactId, `${f.firstName} ${f.lastName}`.trim()])
      );
    } catch (err) {
      logger.warn({ err }, 'Admin emails: CiviCRM unavailable for name join, degrading gracefully');
      nameMap = new Map();
    }

    const rows: EmailEventRow[] = page.map((e) => ({
      id: e.id,
      fellowshipId: e.fellowshipId,
      contactId: e.contactId,
      appointeeName: nameMap.get(e.contactId) || '?',
      academicYear: e.academicYear,
      emailType: e.emailType,
      status: e.status,
      enqueuedAt: e.enqueuedAt.toISOString(),
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      updatedAt: e.updatedAt.toISOString(),
      triggeredBy: e.triggeredBy,
      failureReason: e.failureReason,
      sesMessageId: e.sesMessageId,
    }));

    res.json({ events: rows, nextCursor });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/emails/templates/:type/preview
// Renders a template with hardcoded placeholder data. No querystring input.
// Registered BEFORE /:eventId/preview to avoid Express param shadowing.
const templateTypeSchema = z.enum(['vit-id-invitation', 'bio-project-description']);

router.get('/templates/:type/preview', async (req, res) => {
  try {
    const parsed = templateTypeSchema.safeParse(req.params.type);
    if (!parsed.success) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const bcc = env.APPOINTEE_EMAIL_BCC
      ? env.APPOINTEE_EMAIL_BCC.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const rendered =
      parsed.data === 'vit-id-invitation'
        ? renderVitIdInvitation({ firstName: 'Sofia' })
        : renderBioProjectDescription({ firstName: 'Marco' });

    res.json({ ...rendered, bcc });
  } catch (err) {
    logger.error({ err, type: req.params.type }, 'Admin emails: template preview failed');
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/admin/emails/:eventId/preview
// Re-renders the email template for a specific event using the appointee's
// current first name from CiviCRM.
const eventIdSchema = z.string().min(1);

router.get('/:eventId/preview', async (req, res) => {
  try {
    const eventId = eventIdSchema.safeParse(req.params.eventId);
    if (!eventId.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    if (isDevMode) {
      const devEvents = getDevMockEvents();
      const devEvent = devEvents.find((e) => e.id === eventId.data);
      const isVitId = devEvent?.emailType === 'VIT_ID_INVITATION';
      res.json({
        subject: isVitId
          ? 'Welcome to I Tatti — Claim your VIT ID'
          : 'Biography and Project Description',
        html: isVitId
          ? '<p>Dev mode preview for Sofia. VIT ID invitation.</p>'
          : '<p>Dev mode preview for Marco. Bio & project request.</p>',
        text: isVitId
          ? 'Dev mode preview for Sofia. VIT ID invitation.'
          : 'Dev mode preview for Marco. Bio & project request.',
        bcc: ['dev@itatti.harvard.edu'],
        recipientStatus: 'current' as const,
      });
      return;
    }

    const event = await prisma.appointeeEmailEvent.findUnique({
      where: { id: eventId.data },
    });
    if (!event) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    let contact: Awaited<ReturnType<typeof civicrmService.getContactById>>;
    try {
      contact = await civicrmService.getContactById(event.contactId);
    } catch (err) {
      logger.warn({ err, contactId: event.contactId }, 'Admin emails: CiviCRM unavailable for preview');
      res.status(503).json({ reason: 'civicrm_unavailable' });
      return;
    }

    const bcc = env.APPOINTEE_EMAIL_BCC
      ? env.APPOINTEE_EMAIL_BCC.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    if (!contact) {
      const rendered = renderTemplateSafe(event.emailType, 'Appointee');
      res.json({ ...rendered, bcc, recipientStatus: 'contact_deleted' });
      return;
    }

    const firstName = contact.firstName?.trim();
    if (!firstName && event.emailType === 'VIT_ID_INVITATION') {
      const rendered = renderTemplateSafe('VIT_ID_INVITATION', 'Appointee');
      res.json({ ...rendered, bcc, recipientStatus: 'no_first_name' });
      return;
    }

    try {
      const rendered =
        event.emailType === 'VIT_ID_INVITATION'
          ? renderVitIdInvitation({ firstName: firstName || 'Appointee' })
          : renderBioProjectDescription({ firstName: firstName || 'Appointee' });
      res.json({ ...rendered, bcc, recipientStatus: 'current' });
    } catch (err) {
      if (err instanceof TemplateRenderError) {
        const rendered = renderTemplateSafe(event.emailType, 'Appointee');
        res.json({ ...rendered, bcc, recipientStatus: 'no_first_name' });
        return;
      }
      throw err;
    }
  } catch (err) {
    logger.error({ err, eventId: req.params.eventId }, 'Admin emails: preview failed');
    res.status(500).json({ error: 'internal_error' });
  }
});

function renderTemplateSafe(emailType: AppointeeEmailType, firstName: string) {
  try {
    return emailType === 'VIT_ID_INVITATION'
      ? renderVitIdInvitation({ firstName })
      : renderBioProjectDescription({ firstName });
  } catch (err) {
    logger.warn({ err, emailType, firstName }, 'Admin emails: template render failed');
    return { subject: '(template render failed)', html: '<p>Template could not be rendered.</p>', text: 'Template could not be rendered.' };
  }
}

function getDevMockEvents(): EmailEventRow[] {
  return [
    {
      id: 'dev-evt-1',
      fellowshipId: 101,
      contactId: 3,
      appointeeName: 'Sophie Laurent',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SENT',
      enqueuedAt: '2026-04-10T07:00:00.000Z',
      sentAt: '2026-04-11T09:00:00.000Z',
      updatedAt: '2026-04-11T09:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: '0100018f-abcd-1234-5678-example',
    },
    {
      id: 'dev-evt-2',
      fellowshipId: 102,
      contactId: 2,
      appointeeName: 'James Chen',
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: '2026-04-08T10:00:00.000Z',
      sentAt: '2026-04-08T10:01:00.000Z',
      updatedAt: '2026-04-08T10:01:00.000Z',
      triggeredBy: 'admin_manual:auth0|andrea123:Andrea Caselli',
      failureReason: null,
      sesMessageId: '0100018f-efgh-5678-9012-example',
    },
    {
      id: 'dev-evt-3',
      fellowshipId: 103,
      contactId: 6,
      appointeeName: 'David Williams',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'FAILED',
      enqueuedAt: '2026-04-09T07:00:00.000Z',
      sentAt: null,
      updatedAt: '2026-04-10T09:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: 'SES rejected: Email address is not verified.',
      sesMessageId: null,
    },
    {
      id: 'dev-evt-4',
      fellowshipId: 104,
      contactId: 5,
      appointeeName: 'Elena Petrova',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'PENDING',
      enqueuedAt: '2026-04-27T14:00:00.000Z',
      sentAt: null,
      updatedAt: '2026-04-27T14:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    },
    {
      id: 'dev-evt-5',
      fellowshipId: 105,
      contactId: 8,
      appointeeName: 'Thomas Müller',
      academicYear: '2024-2025',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SKIPPED',
      enqueuedAt: '2025-10-01T07:00:00.000Z',
      sentAt: null,
      updatedAt: '2025-10-02T09:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: 'no_matching_fellowship',
      sesMessageId: null,
    },
    {
      id: 'dev-evt-6',
      fellowshipId: 106,
      contactId: 10,
      appointeeName: 'Robert Taylor',
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENDING',
      enqueuedAt: '2026-04-27T15:00:00.000Z',
      sentAt: null,
      updatedAt: '2026-04-27T15:00:00.000Z',
      triggeredBy: 'admin_manual:auth0|angela456:Angela Nuova',
      failureReason: null,
      sesMessageId: null,
    },
    {
      id: 'dev-evt-7',
      fellowshipId: 101,
      contactId: 3,
      appointeeName: 'Sophie Laurent',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SENT',
      enqueuedAt: '2026-04-20T08:00:00.000Z',
      sentAt: '2026-04-20T08:01:00.000Z',
      updatedAt: '2026-04-20T08:01:00.000Z',
      triggeredBy: 'admin_manual:auth0|andrea123:Andrea Caselli',
      failureReason: null,
      sesMessageId: '0100018f-resend-1234-5678-example',
    },
  ];
}

export const emailsAdminRoutes = router;
