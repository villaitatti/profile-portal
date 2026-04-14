import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (_req, res) => {
  const claims = await prisma.vitIdClaim.findMany({
    orderBy: { claimedAt: 'desc' },
  });
  res.json(claims);
});

export { router as claimsAdminRoutes };
