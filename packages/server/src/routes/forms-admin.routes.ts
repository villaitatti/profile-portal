import { Router } from 'express';
import { z } from 'zod';
import { FORM_REGISTRY, getFormDef } from '@itatti/shared';
import { validate } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import * as formService from '../services/form-invitation.service.js';
import * as civicrmService from '../services/civicrm.service.js';
import { generateFormPdf } from '../services/form-pdf.service.js';
import { isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';

const generateSchema = z.object({
  fellowshipId: z.number().int().positive(),
  contactId: z.number().int().positive(),
  academicYear: z.string().min(1),
  formType: z.string().min(1),
});

const resetSchema = z.object({
  invitationId: z.string().min(1),
});

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

router.get('/invitations', async (req, res) => {
  const { academicYear, formType, status } = req.query as Record<string, string | undefined>;
  const invitations = await formService.listInvitations({ academicYear, formType, status });

  res.json(
    invitations.map((inv) => ({
      id: inv.id,
      token: inv.token,
      fellowshipId: inv.fellowshipId,
      contactId: inv.contactId,
      academicYear: inv.academicYear,
      formType: inv.formType,
      status: inv.status,
      nominationSentAt: inv.nominationSentAt?.toISOString() ?? null,
      submittedAt: inv.submittedAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
      hasResponse: !!inv.response,
    }))
  );
});

router.post('/generate', validate(generateSchema), async (req, res) => {
  const triggeredBy = `admin:${req.userId}`;
  try {
    let appointmentType: string | undefined;

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
        res.status(400).json({ error: 'matching_fellowship_not_found' });
        return;
      }
      appointmentType = fellowship.appointment;
    }

    const result = await formService.generateInvitation({
      ...req.body,
      appointmentType,
      enforceAppointmentType: !isDevMode,
      triggeredBy,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
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
      res.status(err.statusCode).json({
        error: err.message,
        details,
      });
      return;
    }
    throw err;
  }
});

router.post('/nomination-sent/:id', validate(nominationSentSchema), async (req, res) => {
  try {
    const updated = await formService.markNominationSent(
      String(req.params.id),
      req.body.nominationSentOn
    );
    res.json({ id: updated.id, nominationSentAt: updated.nominationSentAt?.toISOString() });
  } catch (err) {
    if (err instanceof formService.ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post('/reset', validate(resetSchema), async (req, res) => {
  const triggeredBy = `admin:${req.userId}`;
  try {
    const result = await formService.resetInvitation(req.body.invitationId, triggeredBy);
    res.json(result);
  } catch (err) {
    if (err instanceof formService.ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get('/response/:invitationId', async (req, res) => {
  const response = await formService.getResponseByInvitationId(req.params.invitationId);
  if (!response) {
    res.status(404).json({ error: 'Response not found' });
    return;
  }
  res.json({ id: response.id, data: response.data, createdAt: response.createdAt.toISOString() });
});

router.get('/response/:invitationId/pdf', async (req, res) => {
  const invitation = await prisma.formInvitation.findUnique({
    where: { id: req.params.invitationId },
    include: { response: true },
  });

  if (!invitation || !invitation.response) {
    res.status(404).json({ error: 'Response not found' });
    return;
  }

  const formDef = getFormDef(invitation.formType);
  if (!formDef) {
    res.status(500).json({ error: 'Form definition not found' });
    return;
  }

  const pdfBuffer = await generateFormPdf(formDef, invitation.response.data as Record<string, unknown>);
  const filename = `${formDef.title.replace(/[^a-zA-Z0-9]/g, '_')}_${invitation.contactId}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

export { router as formsAdminRoutes };
