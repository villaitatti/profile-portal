import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import * as claimService from '../services/claim.service.js';
import { logger } from '../lib/logger.js';

const GENERIC_MESSAGE = 'If you are eligible, you will receive an email with next steps.';
const MIN_RESPONSE_TIME_MS = 1000;

const claimSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
});

async function enforceMinResponseTime(startTime: number): Promise<void> {
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_TIME_MS) {
    const jitter = Math.random() * 500;
    await new Promise((r) => setTimeout(r, MIN_RESPONSE_TIME_MS - elapsed + jitter));
  }
}

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const router = Router();

router.post('/', claimLimiter, validate(claimSchema), async (req, res) => {
  const startTime = Date.now();
  const { email } = req.body;

  try {
    await claimService.processClaim(email);
  } catch (err) {
    logger.error({ err, email: req.body.email?.slice(0, 3) + '***' }, 'Claim flow error');
  }

  await enforceMinResponseTime(startTime);
  res.json({ message: GENERIC_MESSAGE });
});

export { router as claimRoutes };
