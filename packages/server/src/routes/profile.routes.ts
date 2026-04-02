import { Router } from 'express';
import type { UserProfile } from '@itatti/shared';
import { isDevMode } from '../env.js';
import * as civicrmService from '../services/civicrm.service.js';
import { logger } from '../lib/logger.js';

const router = Router();

router.get('/', async (req, res) => {
  // Dev mode: return mock profile
  if (isDevMode) {
    const profile: UserProfile = {
      firstName: 'Dev',
      lastName: 'User',
      email: 'dev@itatti.harvard.edu',
      phone: '+39 055 603251',
      source: 'civicrm',
    };
    res.json(profile);
    return;
  }

  // If we have a CiviCRM ID, fetch profile from CiviCRM
  if (req.civicrmId) {
    try {
      const contact = await civicrmService.getContactById(Number(req.civicrmId));
      if (contact) {
        const profile: UserProfile = {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          imageUrl: contact.imageUrl,
          source: 'civicrm',
        };
        res.json(profile);
        return;
      }
    } catch (err) {
      logger.error({ err, civicrmId: req.civicrmId }, 'CiviCRM lookup failed, falling back to Auth0 profile');
    }
  }

  // Fallback: use Auth0 profile data from the token
  const auth = req.auth as Record<string, unknown> | undefined;
  const profile: UserProfile = {
    firstName: (auth?.given_name as string) || '',
    lastName: (auth?.family_name as string) || '',
    email: (auth?.email as string) || '',
    source: 'auth0',
  };
  res.json(profile);
});

export { router as profileRoutes };
