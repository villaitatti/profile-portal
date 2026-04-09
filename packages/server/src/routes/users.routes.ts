import { Router } from 'express';
import { isDevMode } from '../env.js';
import { listAllUsers } from '../services/auth0.service.js';
import type { Auth0UserListItem } from '../services/auth0.service.js';

const router = Router();

function getDevMockUsers(): Auth0UserListItem[] {
  return [
    { user_id: 'auth0|dev1', email: 'maria.rossi@unifi.it', name: 'Maria Rossi', email_verified: true, last_login: '2026-04-01T10:30:00.000Z', created_at: '2025-09-15T08:00:00.000Z' },
    { user_id: 'auth0|dev2', email: 'james.chen@princeton.edu', name: 'James Chen', email_verified: true, last_login: '2026-04-07T14:20:00.000Z', created_at: '2025-10-01T12:00:00.000Z' },
    { user_id: 'auth0|dev3', email: 'sophie.laurent@sorbonne.fr', name: 'Sophie Laurent', email_verified: false, last_login: undefined, created_at: '2026-03-20T09:00:00.000Z' },
    { user_id: 'auth0|dev4', email: 'a.bianchi@uniroma1.it', name: 'Alessandro Bianchi', email_verified: true, last_login: '2026-03-28T16:45:00.000Z', created_at: '2025-08-01T10:00:00.000Z' },
    { user_id: 'auth0|dev5', email: 'e.petrova@msu.ru', name: 'Elena Petrova', email_verified: true, last_login: '2026-04-05T11:00:00.000Z', created_at: '2025-11-12T14:30:00.000Z' },
    { user_id: 'auth0|dev6', email: 'd.williams@yale.edu', name: 'David Williams', email_verified: true, last_login: '2026-04-08T08:15:00.000Z', created_at: '2025-07-20T09:00:00.000Z' },
    { user_id: 'auth0|dev7', email: 'l.moreno@csic.es', name: 'Lucia Moreno', email_verified: true, last_login: '2026-03-15T13:00:00.000Z', created_at: '2025-12-01T11:00:00.000Z' },
    { user_id: 'auth0|dev8', email: 't.mueller@uni-heidelberg.de', name: 'Thomas Müller', email_verified: false, last_login: undefined, created_at: '2026-02-14T10:00:00.000Z' },
    { user_id: 'auth0|dev9', email: 'c.conti@unibo.it', name: 'Chiara Conti', email_verified: true, last_login: '2026-04-06T17:30:00.000Z', created_at: '2025-09-01T08:00:00.000Z' },
    { user_id: 'auth0|dev10', email: 'r.taylor@oxford.ac.uk', name: 'Robert Taylor', email_verified: true, last_login: '2026-04-02T09:45:00.000Z', created_at: '2025-06-15T10:00:00.000Z' },
  ];
}

// GET /api/admin/users
router.get('/', async (_req, res, next) => {
  try {
    if (isDevMode) {
      res.json(getDevMockUsers());
      return;
    }

    const users = await listAllUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

export const usersRoutes = router;
