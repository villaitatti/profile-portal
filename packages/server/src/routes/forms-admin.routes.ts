import { Router } from 'express';
import { z } from 'zod';
import { FORM_REGISTRY, getFormDef } from '@itatti/shared';
import { validate } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import * as formService from '../services/form-invitation.service.js';
import { generateFormPdf } from '../services/form-pdf.service.js';
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
    const result = await formService.generateInvitation({
      ...req.body,
      triggeredBy,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    if (err instanceof formService.ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post('/nomination-sent/:id', async (req, res) => {
  try {
    const updated = await formService.markNominationSent(req.params.id);
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
