import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const claims = await prisma.vitIdClaim.findMany({
      orderBy: { claimedAt: 'desc' },
    });
    res.json(claims);
  } catch (err) {
    next(err);
  }
});

export { router as claimsAdminRoutes };
