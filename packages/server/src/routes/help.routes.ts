import { Router } from 'express';
import { ErrorCodes } from '@itatti/shared';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import * as jiraService from '../services/jira.service.js';
import { logger } from '../lib/logger.js';
import { rateLimitKey } from '../lib/client-ip.js';

const GENERIC_MESSAGE =
  'Your request has been submitted. Our team will follow up at the email address provided.';

const helpSchema = z.object({
  fullName: z.string().min(2).max(200),
  contactEmail: z.string().email().max(254),
  fellowshipYear: z.string().regex(/^\d{4}-\d{4}$/, 'Format: YYYY-YYYY'),
  message: z.string().max(2000).optional(),
});

const helpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: 'Too many requests. Please try again later.', code: ErrorCodes.RATE_LIMITED },
});

const router = Router();

router.post('/', helpLimiter, validate(helpSchema), async (req, res) => {
  try {
    const result = await jiraService.createHelpTicket(req.body);
    logger.info({ issueKey: result.issueKey }, 'Help ticket created');
  } catch (err) {
    // Honest failure, not a fake success: if the JSM ticket was never created,
    // nobody will ever follow up — the worst outcome for exactly the user who
    // is asking for help. (Unlike /api/claim, there is no anti-enumeration
    // reason to mask outcomes here.) The form shows its retry banner on
    // any non-2xx.
    logger.error({ err }, 'Failed to create help ticket');
    res.status(502).json({
      error: 'We could not submit your request right now. Please try again in a few minutes.',
      code: 'HELP_TICKET_FAILED',
    });
    return;
  }

  res.json({ message: GENERIC_MESSAGE });
});

export { router as helpRoutes };
