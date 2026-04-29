import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as formService from '../services/form-invitation.service.js';
import { logger } from '../lib/logger.js';

const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const router = Router();

router.get('/:token', getLimiter, async (req, res) => {
  const token = req.params.token as string;

  const result = await formService.getInvitationByToken(token);
  if (!result) {
    res.status(404).json({ error: 'Form not found' });
    return;
  }

  const { invitation, formDef } = result;

  res.json({
    id: invitation.id,
    formType: invitation.formType,
    status: invitation.status,
    submittedAt: invitation.submittedAt?.toISOString() ?? null,
    formDef,
    response: invitation.response?.data ?? null,
  });
});

router.post('/:token', async (req, res) => {
  const token = req.params.token as string;

  try {
    const result = await formService.submitForm(token, req.body);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof formService.ServiceError) {
      const body: Record<string, unknown> = { error: err.message };
      if (err.details) body.details = err.details;
      res.status(err.statusCode).json(body);
      return;
    }
    logger.error({ err, token: token.slice(0, 8) + '...' }, 'form_submission_error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as formsPublicRoutes };
