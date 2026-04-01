import { createHash } from 'crypto';
import * as auth0Service from './auth0.service.js';
import * as civicrmService from './civicrm.service.js';
import { evaluateEligibility } from '../utils/eligibility.js';
import { logger } from '../lib/logger.js';

function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 12);
}

export async function processClaim(email: string): Promise<void> {
  const emailHash = hashEmail(email);

  // Step 1: Check Auth0
  const existingUser = await auth0Service.findUserByEmail(email);

  if (existingUser) {
    logger.info({ emailHash }, 'Claim: user already exists');
    // Send password reset so user knows they have an account
    await auth0Service.triggerPasswordSetupEmail(email);
    return;
  }

  // Step 2: Check CiviCRM
  const contact = await civicrmService.findContactByPrimaryEmail(email);

  if (!contact) {
    logger.info({ emailHash }, 'Claim: no CiviCRM contact found');
    return;
  }

  // Step 3: Get fellowships and evaluate eligibility
  const fellowships = await civicrmService.getFellowships(contact.id);
  const eligibility = evaluateEligibility(fellowships);

  logger.info({ emailHash, eligible: eligibility.eligible, reason: eligibility.reason }, 'Claim: eligibility evaluated');

  if (!eligibility.eligible) {
    return;
  }

  // Step 4: Create Auth0 user
  const newUser = await auth0Service.createUser({
    email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    civicrmId: contact.id,
  });

  logger.info({ emailHash, userId: newUser.user_id }, 'Claim: Auth0 user created');

  // Step 5: Assign "fellows" role
  await auth0Service.assignFellowsRole(newUser.user_id);
  logger.info({ emailHash }, 'Claim: fellows role assigned');

  // Step 6: Trigger password setup email
  await auth0Service.triggerPasswordSetupEmail(email);
  logger.info({ emailHash }, 'Claim: password setup email sent');
}
