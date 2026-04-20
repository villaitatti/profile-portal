import { createHash } from 'crypto';
import * as auth0Service from './auth0.service.js';
import * as civicrmService from './civicrm.service.js';
import * as jsmService from './atlassian-jsm.service.js';
import * as emailService from './email.service.js';
import * as appointeeEmailService from './appointee-email.service.js';
import {
  evaluateEligibility,
  classifyFellowship,
  pickBioEmailTargetYear,
} from '../utils/eligibility.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';

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

  // Step 6: Determine fellowship status for org/role assignment
  const hasFellowship = fellowships.length > 0;
  const hasCurrentFellowship = fellowships.some(
    (f) => classifyFellowship(f.startDate, f.endDate) === 'current'
  );

  const rolesAssigned = ['fellows'];

  // Assign fellows-current role synchronously if applicable
  if (hasCurrentFellowship && env.AUTH0_FELLOWS_CURRENT_ROLE_ID) {
    try {
      await auth0Service.assignRole(newUser.user_id, env.AUTH0_FELLOWS_CURRENT_ROLE_ID);
      rolesAssigned.push('fellows-current');
      logger.info({ emailHash }, 'Claim: fellows-current role assigned');
    } catch (err) {
      logger.error({ err, emailHash }, 'Claim: failed to assign fellows-current role');
    }
  }

  // Step 7: Persist claim record
  const claimRecord = await prisma.vitIdClaim.create({
    data: {
      email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      civicrmId: contact.id,
      hasFellowship,
      hasCurrentFellowship,
      rolesAssigned,
      orgsAssigned: [],
    },
  });
  logger.info({ emailHash, hasFellowship, hasCurrentFellowship }, 'Claim: record persisted');

  // Step 8: Trigger password setup email
  await auth0Service.triggerPasswordSetupEmail(email);
  logger.info({ emailHash }, 'Claim: password setup email sent');

  // Step 9: Fire-and-forget async operations (JSM orgs + email notification + bio-email enqueue)
  processAsyncClaimOps({
    claimId: claimRecord.id,
    email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    contactId: contact.id,
    hasFellowship,
    hasCurrentFellowship,
    rolesAssigned,
    fellowships,
  }).catch(
    (err) => logger.error({ err, emailHash }, 'Claim: async operations failed')
  );
}

async function processAsyncClaimOps(params: {
  claimId: string;
  email: string;
  firstName: string;
  lastName: string;
  contactId: number;
  hasFellowship: boolean;
  hasCurrentFellowship: boolean;
  rolesAssigned: string[];
  fellowships: Awaited<ReturnType<typeof civicrmService.getFellowships>>;
}): Promise<void> {
  const {
    claimId,
    email,
    firstName,
    lastName,
    contactId,
    hasFellowship,
    hasCurrentFellowship,
    rolesAssigned,
    fellowships,
  } = params;
  const displayName = `${firstName} ${lastName}`;
  const orgsAssigned: string[] = [];

  if (hasFellowship && jsmService.isJsmConfigured()) {
    const result = await jsmService.addUserToFormerAppointees(email, displayName);
    if (result.site1) orgsAssigned.push('Former Appointees (Site 1)');
    if (result.site2) orgsAssigned.push('Former Appointees (Site 2)');
  }

  if (hasCurrentFellowship && jsmService.isJsmConfigured()) {
    const result = await jsmService.addUserToCurrentAppointees(email, displayName);
    if (result.site1) orgsAssigned.push('Current Appointees (Site 1)');
    if (result.site2) orgsAssigned.push('Current Appointees (Site 2)');
  }

  // Update claim record with org results
  if (orgsAssigned.length > 0) {
    await prisma.vitIdClaim.update({
      where: { id: claimId },
      data: { orgsAssigned },
    });
  }

  // Send notification email
  await emailService.sendClaimNotification({
    email,
    firstName,
    lastName,
    hasFellowship,
    hasCurrentFellowship,
    rolesAssigned,
    claimedAt: new Date(),
  });

  // Enqueue the bio-and-project-description email (24h delay; daily cron
  // dispatches it). We pick the target academic year from the fellowships we
  // already have in memory — for a returning fellow with a new upcoming
  // accepted fellowship this picks the upcoming year, not the past one.
  const target = pickBioEmailTargetYear(fellowships);
  if (target) {
    try {
      await appointeeEmailService.enqueueBioEmail({
        contactId,
        academicYear: target.academicYear,
        triggeredBy: 'claim_auto',
        delayHours: 24,
      });
    } catch (err) {
      // Never fail the claim flow because of the bio-email enqueue.
      logger.error(
        { err, contactId, academicYear: target.academicYear },
        'Claim: failed to enqueue bio email (will be retried manually if needed)'
      );
    }
  } else {
    logger.info(
      { contactId },
      'Claim: no current/upcoming-accepted fellowship, bio email not enqueued'
    );
  }
}
