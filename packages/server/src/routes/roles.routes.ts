import { Router } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { KnownRoles } from '@itatti/shared';
import { isDevMode } from '../env.js';
import { DEV_ROLES } from './__dev__/fixtures.js';
import * as auth0Service from '../services/auth0.service.js';
import { logger } from '../lib/logger.js';

const router = Router();

router.get('/', requireRole(KnownRoles.STAFF_IT), async (_req, res) => {
  if (isDevMode) {
    res.json(DEV_ROLES);
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
