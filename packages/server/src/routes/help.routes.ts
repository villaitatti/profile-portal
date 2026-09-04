import { Router } from 'express';
import { ErrorCodes } from '@itatti/shared';
import { createHash } from 'crypto';
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

// Second limiter, keyed on the *target* email rather than the caller —
// mirrors claimEmailLimiter in claim.routes.ts.
//
// The JSM ticket is raised on behalf of contactEmail, so JSM sends its
// request-created notification to that mailbox. The IP limiter alone cannot
// bound how much of that mail a single third-party address receives: an
// attacker submitting someone else's address from rotating IPs directs
// genuine-looking JSM notifications at their inbox (harassment or a phishing
// setup) and burns the service desk's mail quota. Mounted after `validate` so
// only schema-valid addresses are keyed; the key is hashed and lowercased —
// unlike the claim schema, contactEmail is not transformed, because the
// ticket should preserve the casing the requester typed.
//
// The 429 body is fixed and depends only on what this caller already
// submitted, never on whether the address exists — no enumeration oracle.
const helpEmailLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    createHash('sha256')
      .update(String(req.body?.contactEmail ?? '').trim().toLowerCase())
      .digest('hex'),
  message: { error: 'Too many requests for this address. Please try again later.', code: ErrorCodes.RATE_LIMITED },
});

const router = Router();

router.post('/', helpLimiter, validate(helpSchema), helpEmailLimiter, async (req, res) => {
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
