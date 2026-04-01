import { Router } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { KnownRoles } from '@itatti/shared';
import { isDevMode } from '../env.js';
import * as auth0Service from '../services/auth0.service.js';
import { logger } from '../lib/logger.js';

const mockRoles = [
  { id: 'rol_1', name: 'fellows', description: 'All appointees (former + current)' },
  { id: 'rol_2', name: 'fellows-current', description: 'Current academic year appointees' },
  { id: 'rol_3', name: 'staff-it', description: 'IT staff with admin access' },
];

const router = Router();

router.get('/', requireRole(KnownRoles.STAFF_IT), async (_req, res) => {
  if (isDevMode) {
    res.json(mockRoles);
    return;
  }

  try {
    const roles = await auth0Service.listRoles();
    res.json(roles);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Auth0 roles');
    res.status(500).json({ error: 'Failed to fetch roles', code: 'INTERNAL_ERROR' });
  }
});

export { router as rolesRoutes };
