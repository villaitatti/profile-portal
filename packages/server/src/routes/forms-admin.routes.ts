import { Router } from 'express';
import { z } from 'zod';
import { FORM_REGISTRY, getFormDef, type FormPdfKind } from '@itatti/shared';
import { validate } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import * as formService from '../services/form-invitation.service.js';
import * as civicrmService from '../services/civicrm.service.js';
import {
  FORM_PDF_KINDS,
  generateFormPdf,
  getFormPdfKindLabel,
  type FormPdfMetadata,
} from '../services/form-pdf.service.js';
import { isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import { getFellowsCached } from '../lib/fellows-cache.js';

/**
 * Build a NameLookup backed by the shared fellows cache (lib/fellows-cache.ts,
 * 120s TTL, empty-response guard). On CiviCRM failure, returns a lookup whose
 * getName() always returns null — the caller's items still include contactId so
 * the UI can render a "Contact #<id>" fallback.
 */
async function buildNameLookup(): Promise<formService.NameLookup> {
  try {
    const fellows = await getFellowsCached('forms_admin');
    const byId = new Map<number, string>();
    for (const f of fellows) {
      const name = `${f.firstName} ${f.lastName}`.trim();
      if (name) byId.set(f.contactId, name);
    }
    return {
      getName(contactId: number) {
        return byId.get(contactId) ?? null;
      },
    };
  } catch (err) {
    logger.warn({ err }, 'forms_admin_name_lookup_civicrm_failed');
    return { getName: () => null };
  }
}

const generateSchema = z.object({
  fellowshipId: z.number().int().positive(),
  contactId: z.number().int().positive(),
  academicYear: z.string().min(1),
  formType: z.string().min(1),
});

const resetSchema = z.object({
  invitationId: z.string().min(1),
});

const pdfKindSchema = z.enum(
  FORM_PDF_KINDS.map(({ kind }) => kind) as [FormPdfKind, ...FormPdfKind[]]
);

const nominationSentSchema = z.object({
  nominationSentOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine((value) => {
      const date = new Date(`${value}T12:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'must be a real calendar date')
    .optional(),
});

const router = Router();

router.get('/registry', (_req, res) => {
  res.json(FORM_REGISTRY);
});

const invitationsQuerySchema = z.object({
  academicYear: z.string().optional(),
  formType: z.string().optional(),
  status: z.string().optional(),
});

router.get('/invitations', async (req, res, next) => {
  const { academicYear, formType, status } = invitationsQuerySchema.parse(req.query);

  try {
    const nameLookup = await buildNameLookup();
    const { items, facets } = await formService.listInvitations(
      { academicYear, formType, status },
      nameLookup
    );

    // Deliberately OMIT `token` from this response. Form tokens are the key
    // to the unauthenticated GET /api/forms/:token endpoint that returns the
    // submitted response data. The admin submissions archive has no reason
    // to expose tokens — admin actions (reset, download PDF, etc.) use the
    // invitation id, not the token. Keeping tokens out of this response
    // reduces blast radius if an admin page is compromised, screenshotted,
    // or leaks through a browser extension.
    res.json({
      items: items.map((inv) => ({
        id: inv.id,
        fellowshipId: inv.fellowshipId,
        contactId: inv.contactId,
        contactName: inv.contactName,
        academicYear: inv.academicYear,
        formType: inv.formType,
        formTitle: inv.formTitle,
        status: inv.status,
        nominationSentAt: inv.nominationSentAt?.toISOString() ?? null,
        submittedAt: inv.submittedAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
        hasResponse: inv.hasResponse,
      })),
      facets,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', validate(generateSchema), async (req, res, next) => {
  const triggeredBy = `admin:${req.userId}`;
  try {
    let appointmentType: string | undefined;
    let fellowshipType: string | undefined;

    if (!isDevMode) {
      const fellowship = await civicrmService.getFellowWithContact(
        req.body.fellowshipId,
        req.body.contactId
      );
      if (!fellowship) {
        logger.warn(
          {
            fellowshipId: req.body.fellowshipId,
            contactId: req.body.contactId,
            formType: req.body.formType,
          },
          'form_generation_rejected_no_matching_fellowship'
        );
        res.status(400).json({
          error: 'No fellowship matching this appointee and academic year was found in CiviCRM.',
          code: 'MATCHING_FELLOWSHIP_NOT_FOUND',
        });
        return;
      }
      appointmentType = fellowship.appointment;
      fellowshipType = fellowship.fellowship;
    }

    const result = await formService.generateInvitation({
      ...req.body,
      appointmentType,
      fellowshipType,
      enforceAppointmentType: !isDevMode,
      triggeredBy,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    // ServiceError renders via the error middleware; this catch only adds the
    // alerting-relevant log event for the no_form_configured rejection.
    if (err instanceof formService.ServiceError) {
      const details = err.details;
      if (
        typeof details === 'object' &&
        details !== null &&
        'code' in details &&
        (details as { code?: string }).code === 'no_form_configured'
      ) {
        logger.warn(
          {
            fellowshipId: req.body.fellowshipId,
            contactId: req.body.contactId,
            formType: req.body.formType,
            details,
          },
          'form_generation_rejected_no_form_configured'
        );
      }
    }
    next(err);
  }
});

router.post('/nomination-sent/:id', validate(nominationSentSchema), async (req, res, next) => {
  try {
    const updated = await formService.markNominationSent(
      String(req.params.id),
      req.body.nominationSentOn
    );
    res.json({ id: updated.id, nominationSentAt: updated.nominationSentAt?.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post('/reset', validate(resetSchema), async (req, res, next) => {
  const triggeredBy = `admin:${req.userId}`;
  try {
    const result = await formService.resetInvitation(req.body.invitationId, triggeredBy);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/response/:invitationId', async (req, res, next) => {
  try {
    const response = await formService.getResponseByInvitationId(req.params.invitationId);
    if (!response) {
      res.status(404).json({ error: 'Response not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ id: response.id, data: response.data, createdAt: response.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.get('/response/:invitationId/pdf/:pdfKind', async (req, res, next) => {
  const pdfKind = pdfKindSchema.parse(req.params.pdfKind);

  try {
    const invitation = await prisma.formInvitation.findUnique({
      where: { id: req.params.invitationId },
      include: { response: true },
    });

    if (!invitation || !invitation.response) {
      res.status(404).json({ error: 'Response not found', code: 'NOT_FOUND' });
      return;
    }

    const formDef = getFormDef(invitation.formType);
    if (!formDef) {
      // Registry integrity failure: a stored formType no longer resolves.
      res.status(500).json({ error: 'Form definition not found', code: 'INTERNAL_ERROR' });
      return;
    }

    const responseData = invitation.response.data as Record<string, unknown>;
    const metadata = await buildPdfMetadata(invitation, responseData);
    const pdfBuffer = await generateFormPdf(formDef, responseData, {
      kind: pdfKind,
      metadata,
    });
    const label = getFormPdfKindLabel(formDef, pdfKind);
    const filename = `${sanitizeFilename(formDef.title)}_${sanitizeFilename(label)}_${invitation.contactId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    // A @react-pdf render failure lands here. Before this, it rejected straight
    // into Node and took the process down.
    next(err);
  }
});

async function buildPdfMetadata(
  invitation: {
    fellowshipId: number;
    contactId: number;
    academicYear: string;
  },
  responseData: Record<string, unknown>
): Promise<FormPdfMetadata> {
  let civiName: string | null = null;
  let fellowshipType: string | null = null;
  let appointment: string | null = null;

  try {
    const fellow = await civicrmService.getFellowWithContact(
      invitation.fellowshipId,
      invitation.contactId
    );
    if (fellow) {
      civiName = [fellow.firstName, fellow.lastName].filter(Boolean).join(' ').trim() || null;
      fellowshipType = fellow.fellowship ?? null;
      appointment = fellow.appointment ?? null;
    }
  } catch (err) {
    logger.warn(
      { err, fellowshipId: invitation.fellowshipId, contactId: invitation.contactId },
      'forms_admin_pdf_metadata_civicrm_failed'
    );
  }

  return {
    appointeeName: responseName(responseData) ?? civiName,
    academicYear: invitation.academicYear,
    fellowshipType,
    appointment,
  };
}

function responseName(data: Record<string, unknown>): string | null {
  const givenName = typeof data.givenName === 'string' ? data.givenName.trim() : '';
  const surname = typeof data.surname === 'string' ? data.surname.trim() : '';
  const fullName = [givenName, surname].filter(Boolean).join(' ').trim();
  return fullName || null;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'form';
}

export { router as formsAdminRoutes };
