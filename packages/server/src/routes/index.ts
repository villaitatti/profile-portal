import type { Express } from 'express';
import { KnownRoles } from '@itatti/shared';
import { healthRoutes } from './health.routes.js';
import { applicationsRoutes } from './applications.routes.js';
import { profileRoutes } from './profile.routes.js';
import { rolesRoutes } from './roles.routes.js';
import { claimRoutes } from './claim.routes.js';
import { helpRoutes } from './help.routes.js';
import { fellowsAdminRoutes } from './fellows-admin.routes.js';
import { syncAdminRoutes, syncSseRoutes } from './sync-admin.routes.js';
import { authMiddleware, extractUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export function registerRoutes(app: Express) {
  // Public routes (no auth required)
  app.use('/api/health', healthRoutes);
  app.use('/api/claim', claimRoutes);
  app.use('/api/help', helpRoutes);

  // Protected routes (auth required)
  app.use('/api/profile', authMiddleware, extractUser, profileRoutes);
  app.use('/api/applications', authMiddleware, extractUser, applicationsRoutes);
  app.use('/api/roles', authMiddleware, extractUser, rolesRoutes);

  // Admin routes: Fellows management (fellows-admin OR staff-it)
  app.use(
    '/api/admin/fellows',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT),
    fellowsAdminRoutes
  );

  // Admin routes: Atlassian sync (staff-it only)
  // JWT-protected routes (CRUD, dry-run, execute, history, sse-token issuance)
  app.use(
    '/api/admin/sync',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.STAFF_IT),
    syncAdminRoutes
  );

  // SSE stream — mounted OUTSIDE JWT chain. Auth via short-lived SSE token in query param.
  // Tokens are issued by POST /api/admin/sync/sse-token (JWT-protected above).
  app.use('/api/admin/sync', syncSseRoutes);
}
