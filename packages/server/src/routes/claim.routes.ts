import { Router } from 'express';
import { ErrorCodes } from '@itatti/shared';
import { createHash } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import * as claimService from '../services/claim.service.js';
import { logger } from '../lib/logger.js';
import { rateLimitKey } from '../lib/client-ip.js';

const GENERIC_MESSAGE = 'If you are eligible, you will receive an email with next steps.';

// Every claim responds at this fixed deadline. See the handler for why a floor
// alone was not enough.
const RESPONSE_DEADLINE_MS = 2000;

const claimSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: 'Too many requests. Please try again later.', code: ErrorCodes.RATE_LIMITED },
});

// Second limiter, keyed on the *target* email rather than the caller.
//
// The IP limiter alone cannot bound how many password-setup emails a single
// mailbox receives: an attacker who submits a known fellow's address from
// rotating addresses fills their inbox with genuine Auth0 "set your password"
// mail, which makes a follow-up phish ("sorry about the duplicates, use this
// link") highly credible, and burns the tenant's email quota. Mounted after
// `validate` so the normalized, lowercased address from the schema is the key.
//
// Returning 429 here does not weaken the anti-enumeration property: the bucket
// depends only on what this caller already submitted, never on whether the
// address exists.
const claimEmailLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    createHash('sha256').update(String(req.body?.email ?? '')).digest('hex'),
  message: { error: 'Too many requests for this address. Please try again later.', code: ErrorCodes.RATE_LIMITED },
});

const router = Router();

router.post('/', claimLimiter, validate(claimSchema), claimEmailLimiter, async (req, res) => {
  const startTime = Date.now();
  const { email } = req.body;

  // Kick the work off without tying the response to how long it takes. The
  // three outcomes do wildly different amounts of upstream work — an unknown
  // address is two CiviCRM lookups, while provisioning a new fellow paginates
  // the whole Auth0 fellows role and then creates a user, assigns roles, writes
  // an audit row and calls JSM. A minimum response time hid the fast paths but
  // left the slow one advertising itself, so response latency alone classified
  // any address as unknown / has-a-VIT-ID / eligible-I-Tatti-fellow. Racing the
  // work against a fixed deadline makes all three indistinguishable.
  const work = claimService.processClaim(email).catch((err) => {
    logger.error({ err, emailPrefix: String(email).slice(0, 3) + '***' }, 'Claim flow error');
  });

  await Promise.race([work, sleep(RESPONSE_DEADLINE_MS)]);
  await sleep(RESPONSE_DEADLINE_MS - (Date.now() - startTime));
  res.json({ message: GENERIC_MESSAGE });
});

export { router as claimRoutes };
