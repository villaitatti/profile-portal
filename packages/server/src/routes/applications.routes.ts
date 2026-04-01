import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { KnownRoles } from '@itatti/shared';
import * as service from '../services/applications.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  loginMethod: z.enum(['vit-id', 'harvard-key']),
  requiredRoles: z.array(z.string()).min(1),
  sortOrder: z.number().int().optional(),
});

const updateSchema = createSchema.partial();

const router = Router();

// List applications — filtered by user roles
router.get('/', async (req, res) => {
  const apps = await service.listApplications(req.userRoles);
  res.json(apps);
});

// Get single application
router.get('/:id', async (req, res) => {
  const app = await service.getApplication(Number(req.params.id));
  if (!app) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return;
  }
  res.json(app);
});

// Create application — staff-it only
router.post(
  '/',
  requireRole(KnownRoles.STAFF_IT),
  validate(createSchema),
  async (req, res) => {
    const app = await service.createApplication(req.body);
    res.status(201).json(app);
  }
);

// Update application — staff-it only
router.put(
  '/:id',
  requireRole(KnownRoles.STAFF_IT),
  validate(updateSchema),
  async (req, res) => {
    const app = await service.updateApplication(Number(req.params.id), req.body);
    if (!app) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(app);
  }
);

// Delete application — staff-it only
router.delete('/:id', requireRole(KnownRoles.STAFF_IT), async (req, res) => {
  const deleted = await service.deleteApplication(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true });
});

export { router as applicationsRoutes };
