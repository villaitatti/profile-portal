import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { KnownRoles } from '@itatti/shared';
import * as service from '../services/applications.service.js';

// `z.string().url()` delegates to `new URL()`, which happily parses
// `javascript:alert(1)` and other non-navigable schemes. Tile URLs and images
// are rendered into the dashboard grid, so constrain them to http(s). The CSP
// in app.ts already blocks script-scheme navigation; this closes the hole at the
// point of storage instead of relying on the last line of defence.
const httpUrl = (max: number) =>
  z
    .string()
    .max(max)
    .url()
    .refine((value) => /^https?:$/.test(new URL(value).protocol), {
      message: 'URL must use http or https',
    });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  url: httpUrl(2048),
  imageUrl: httpUrl(2048).optional(),
  blurPlaceholder: z.string().max(100_000).optional(),
  loginMethod: z.enum(['vit-id', 'harvard-key', 'none']),
  requiredRoles: z.array(z.string()).min(1),
  sortOrder: z.number().int().optional(),
});

const updateSchema = createSchema.partial();

// Route params arrive as strings. `Number('abc')` is NaN, which Prisma rejects
// with a validation error rather than returning an empty result — so without
// this a typo'd URL produced a 500.
// `req.params` is typed `string | string[]` (the Express 5 types model repeated
// wildcard segments), so reject anything that isn't a single value rather than
// letting Number() coerce an array.
const idSchema = z.coerce.number().int().positive();

function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const INVALID_ID = { error: 'Invalid id', code: 'INVALID_ID' } as const;
const NOT_FOUND = { error: 'Not found', code: 'NOT_FOUND' } as const;

const router = Router();

// Async style (repo convention, settled 2026-08): rely on Express 5's native
// forwarding of async rejections to the error middleware. Handlers carry an
// explicit try/catch ONLY when they map or clean up errors themselves. The
// behavioural contract (rejection → 500, never a crash) is pinned by
// __tests__/routes/async-error-handling.test.ts.

// List applications — filtered by user roles
router.get('/', async (req, res) => {
  const apps = await service.listApplications(req.userRoles);
  res.json(apps);
});

// Get a single application for editing. Regular users consume the role-filtered
// collection endpoint; allowing them to address records by numeric id would
// expose inactive and role-restricted application metadata.
router.get('/:id', requireRole(KnownRoles.STAFF_IT), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json(INVALID_ID);
    return;
  }
  const app = await service.getApplication(id);
  if (!app) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json(app);
});

// Create application — staff-it only
router.post('/', requireRole(KnownRoles.STAFF_IT), validate(createSchema), async (req, res) => {
  const app = await service.createApplication(req.body);
  res.status(201).json(app);
});

// Update application — staff-it only
router.put('/:id', requireRole(KnownRoles.STAFF_IT), validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json(INVALID_ID);
    return;
  }
  const app = await service.updateApplication(id, req.body);
  if (!app) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json(app);
});

// Delete application — staff-it only
router.delete('/:id', requireRole(KnownRoles.STAFF_IT), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json(INVALID_ID);
    return;
  }
  const deleted = await service.deleteApplication(id);
  if (!deleted) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json({ success: true });
});

export { router as applicationsRoutes };
