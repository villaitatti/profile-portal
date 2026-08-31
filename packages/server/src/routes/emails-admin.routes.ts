import { Router } from 'express';
import { z } from 'zod';
import { env, isDevMode } from '../env.js';
import { prisma } from '../lib/prisma.js';
import * as civicrmService from '../services/civicrm.service.js';
import { listEmailEvents } from '../services/email-events.service.js';
import type { AppointeeEmailType } from '../generated/prisma/client.js';
import {
  renderVitIdInvitation,
  renderBioProjectDescription,
  TemplateRenderError,
} from '../templates/render.js';
import { logger } from '../lib/logger.js';
import { getDevEmailEvents } from './__dev__/fixtures.js';

const router = Router();

// GET /api/admin/emails
// Returns email events with joined appointee names. Supports cursor-based pagination
// and server-side filtering by year, type, and status.
const VALID_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  cursor: z.string().optional(),
  year: z.string().optional(),
  type: z.enum(['BIO_PROJECT_DESCRIPTION', 'VIT_ID_INVITATION']).optional(),
  // Comma-separated status filter, validated and split by the schema so the
  // handler receives a clean array (ZodError → 400 via the error middleware).
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .refine((statuses) => statuses.every((s) => (VALID_STATUSES as readonly string[]).includes(s)), {
      message: `each status must be one of ${VALID_STATUSES.join(', ')}`,
    }),
});

router.get('/', async (req, res) => {
  const { limit, cursor, year, type, status } = listQuerySchema.parse(req.query);
  if (isDevMode) {
    res.json({ events: getDevEmailEvents(), nextCursor: null });
    return;
  }

  const result = await listEmailEvents({ limit, cursor, year, type, statuses: status });
  res.json(result);
});

// GET /api/admin/emails/templates/:type/preview
// Renders a template with hardcoded placeholder data. No querystring input.
// Registered BEFORE /:eventId/preview to avoid Express param shadowing.
const templateTypeSchema = z.enum(['vit-id-invitation', 'bio-project-description']);

router.get('/templates/:type/preview', async (req, res, next) => {
  // Unknown template type is a 404 (the route exists; the resource doesn't) —
  // not a validation 400, so this stays a safeParse rather than .parse.
  const parsed = templateTypeSchema.safeParse(req.params.type);
  if (!parsed.success) {
    res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND' });
    return;
  }
  try {
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
    next(err);
  }
});

// GET /api/admin/emails/:eventId/preview
// Re-renders the email template for a specific event using the appointee's
// current first name from CiviCRM.
const eventIdSchema = z.string().min(1);

router.get('/:eventId/preview', async (req, res, next) => {
  const eventId = eventIdSchema.parse(req.params.eventId);
  try {
    if (isDevMode) {
      const devEvents = getDevEmailEvents();
      const devEvent = devEvents.find((e) => e.id === eventId);
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
      where: { id: eventId },
    });
    if (!event) {
      res.status(404).json({ error: 'Email event not found', code: 'NOT_FOUND' });
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
    next(err);
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


export const emailsAdminRoutes = router;
