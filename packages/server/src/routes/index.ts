import type { Express } from 'express';
import { KnownRoles } from '@itatti/shared';
import { healthRoutes } from './health.routes.js';
import { applicationsRoutes } from './applications.routes.js';
import { profileRoutes } from './profile.routes.js';
import { rolesRoutes } from './roles.routes.js';
import { claimRoutes } from './claim.routes.js';
import { helpRoutes } from './help.routes.js';
import { fellowsAdminRoutes, handleVitIdLookup } from './fellows-admin.routes.js';
import { syncAdminRoutes, syncSseRoutes } from './sync-admin.routes.js';
import { claimsAdminRoutes } from './claims-admin.routes.js';
import { automationAdminRoutes } from './automation-admin.routes.js';
import { emailsAdminRoutes } from './emails-admin.routes.js';
import { devEmailPreviewRoutes } from './__dev__/email-preview.routes.js';
import { authMiddleware, extractUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { env } from '../env.js';

export function registerRoutes(app: Express) {
  // Public routes (no auth required)
  app.use('/api/health', healthRoutes);
  app.use('/api/claim', claimRoutes);
  app.use('/api/help', helpRoutes);

  // Dev-only: render compiled MJML email templates inline without auth or
  // CiviCRM/Auth0 dependencies. Gated on NODE_ENV !== 'production' so these
  // handlers never exist on the real production instance.
  if (env.NODE_ENV !== 'production') {
    app.use('/__dev__/email-preview', devEmailPreviewRoutes);
  }

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

  // Admin routes: Unified VIT ID lookup — "Has VIT ID?" page primary endpoint
  // (fellows-admin OR staff-it). POST with body `{ q }` — decides internally
  // whether to run a reverse match ladder (email-shape) or a name substring
  // search. POST (not GET) so email addresses never land in access logs,
  // browser history, or intermediate proxies.
  app.post(
    '/api/admin/vit-id-lookup',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT),
    handleVitIdLookup
  );

  // Admin routes: Claim log (staff-IT only)
  app.use(
    '/api/admin/claims',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.STAFF_IT),
    claimsAdminRoutes
  );

  // Admin routes: Automations (staff-IT only)
  app.use(
    '/api/admin/automations',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.STAFF_IT),
    automationAdminRoutes
  );

  // Admin routes: Emails log + templates (fellows-admin OR staff-it)
  app.use(
    '/api/admin/emails',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT),
    emailsAdminRoutes
  );

  // SSE stream — mounted BEFORE the JWT chain so EventSource requests (which can't
  // send Authorization headers) reach the SSE token handler instead of being rejected.
  app.use('/api/admin/sync', syncSseRoutes);

  // Admin routes: Atlassian sync (staff-it only)
  // JWT-protected routes (CRUD, dry-run, execute, history, sse-token issuance)
  app.use(
    '/api/admin/sync',
    authMiddleware,
    extractUser,
    requireRole(KnownRoles.STAFF_IT),
    syncAdminRoutes
  );
}
