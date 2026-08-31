import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

// Cursor pagination: the claim log grows unbounded (one row per successful
// claim, forever), so the endpoint pages by (claimedAt, id) cursor instead of
// returning the whole table. The default page is generous — the admin UI
// loads more on demand.
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  cursor: z.string().optional(),
});

router.get('/', async (req, res) => {
  const { limit, cursor } = listQuerySchema.parse(req.query);

  const claims = await prisma.vitIdClaim.findMany({
    orderBy: [{ claimedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = claims.length > limit;
  const page = hasMore ? claims.slice(0, limit) : claims;
  res.json({
    claims: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});

export { router as claimsAdminRoutes };
