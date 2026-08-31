import { Router } from 'express';
import { ErrorCodes } from '@itatti/shared';
import rateLimit from 'express-rate-limit';
import * as formService from '../services/form-invitation.service.js';
import { logger } from '../lib/logger.js';
import { rateLimitKey } from '../lib/client-ip.js';

const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: 'Too many requests. Please try again later.', code: ErrorCodes.RATE_LIMITED },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: 'Too many submission attempts. Please try again later.', code: ErrorCodes.RATE_LIMITED },
});

const router = Router();

// ServiceError extends HttpError, so the error middleware renders it with the
// right status and { error, code, details? } body — no per-route mapping. The
// named log events (form_load_error / form_submission_error) are kept for
// unexpected failures because log-based alerting keys on them.
router.get('/:token', getLimiter, async (req, res, next) => {
  const token = req.params.token as string;
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await formService.getInvitationByToken(token);
    if (!result) {
      res.status(404).json({ error: 'Form not found', code: 'NOT_FOUND' });
      return;
    }

    const { invitation, formDef } = result;

    res.json({
      id: invitation.id,
      formType: invitation.formType,
      status: invitation.status,
      submittedAt: invitation.submittedAt?.toISOString() ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      formDef,
    });
  } catch (err) {
    if (!(err instanceof formService.ServiceError)) {
      logger.error({ err }, 'form_load_error');
    }
    next(err);
  }
});

router.post('/:token', submitLimiter, async (req, res, next) => {
  const token = req.params.token as string;
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await formService.submitForm(token, req.body);
    res.status(201).json(result);
  } catch (err) {
    if (!(err instanceof formService.ServiceError)) {
      logger.error({ err }, 'form_submission_error');
    }
    next(err);
  }
});

export { router as formsPublicRoutes };
