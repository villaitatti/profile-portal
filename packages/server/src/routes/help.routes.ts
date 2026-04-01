import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import * as jiraService from '../services/jira.service.js';
import { logger } from '../lib/logger.js';

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
  message: { error: 'Too many requests. Please try again later.' },
});

const router = Router();

router.post('/', helpLimiter, validate(helpSchema), async (req, res) => {
  try {
    const result = await jiraService.createHelpTicket(req.body);
    logger.info({ issueKey: result.issueKey }, 'Help ticket created');
  } catch (err) {
    logger.error({ err }, 'Failed to create help ticket');
  }

  res.json({ message: GENERIC_MESSAGE });
});

export { router as helpRoutes };
