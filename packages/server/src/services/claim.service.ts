import { createHash } from 'crypto';
import * as auth0Service from './auth0.service.js';
import * as civicrmService from './civicrm.service.js';
import * as jsmService from './atlassian-jsm.service.js';
import * as emailService from './email.service.js';
import * as appointeeEmailService from './appointee-email.service.js';
import { buildAuth0Maps, reconcile, type LadderFellow } from './vit-id-match.js';
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

  // Step 1: Check Auth0 by exact email (unchanged).
  const existingUser = await auth0Service.findUserByEmail(email);

  if (existingUser) {
    logger.info({ emailHash }, 'Claim: user already exists');
    // Send password reset so user knows they have an account
    await auth0Service.triggerPasswordSetupEmail(email);
    return;
  }

  // Step 1.5: Run the match ladder. This catches the case where the claimant
  // typed a new email but already has a VIT ID under an older email.
  // See services/vit-id-match.ts for the full rules.
  const ladderResult = await runClaimLadder(email, emailHash);
  if (ladderResult === 'handled') {
    // Either a returning fellow was matched (password reset sent to their old
    // Auth0 email) or the ladder returned needs-review (IT notified). Either
    // way, do NOT proceed to provision a new account.
    return;
  }

  // Step 2: Check CiviCRM via any-email lookup (not just primary). This uses
  // the Email.get endpoint so secondary addresses count too.
  const contactLookup = await civicrmService.findContactIdByAnyEmail(email);

  if (!contactLookup.found) {
    if ('duplicate' in contactLookup && contactLookup.duplicate) {
      // Same email on 2+ CiviCRM contacts — a data bug. Refuse to guess which
      // contact to provision against; notify IT.
      logger.warn(
        { emailHash, contactIds: contactLookup.contactIds },
        'Claim: duplicate CiviCRM contact — needs manual reconciliation'
      );
      await emailService.sendClaimNeedsReconciliationNotification({
        claimantEmail: email,
        reason: 'duplicate-civicrm-contact',
        candidates: [],
        civicrmContactIds: contactLookup.contactIds,
      });
      return;
    }
    logger.info({ emailHash }, 'Claim: no CiviCRM contact found');
    return;
  }

  const contact = await civicrmService.getContactById(contactLookup.contactId);
  if (!contact) {
    // Contact was deleted between the Email.get and Contact.get — rare race.
    logger.warn({ emailHash, contactId: contactLookup.contactId }, 'Claim: CiviCRM contact disappeared');
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

/**
 * Runs the full 4-tier ladder (primary-email → civicrm_id → secondary-email →
 * name) against the claimant's typed email. Dispatches based on the
 * `FellowMatch` outcome:
 *
 *   'active' or 'active-different-email' → existing VIT ID; send password
 *      reset to the MATCHED Auth0 email (not the claimant's typed email if
 *      they differ). Notify IT via `sendClaimNeedsReconciliationNotification`
 *      with `reason: 'returning-fellow-reset-sent'` so staff can intervene
 *      if the claimant no longer controls the old mailbox. Write a
 *      `vitIdClaim` audit row — DB is the source of truth for "a claim
 *      happened," independent of SES.
 *
 *   'needs-review' → refuse to guess. Write a `vitIdClaim` audit row tagged
 *      with the reason, notify IT, and do NOT create a new Auth0 account,
 *      send a reset, or return the claimant to the success path.
 *
 *   'no-account' → return 'proceed' so the caller creates a new Auth0
 *      account as usual.
 */
async function runClaimLadder(
  email: string,
  emailHash: string
): Promise<'handled' | 'proceed'> {
  const contactLookup = await civicrmService.findContactIdByAnyEmail(email);

  // Duplicate CiviCRM contact: main `processClaim` flow handles this branch
  // (it re-runs findContactIdByAnyEmail and emits the reconciliation
  // notification). We return 'proceed' so the caller hits that path once.
  if (!contactLookup.found && 'duplicate' in contactLookup && contactLookup.duplicate) {
    return 'proceed';
  }

  if (!contactLookup.found) {
    // No CiviCRM contact carries this email. Caller creates fresh.
    return 'proceed';
  }

  // We have a CiviCRM contact. Build a LadderFellow from its data and run the
  // full 4-tier reconcile(). This catches returning fellows whose old Auth0
  // account is reachable via civicrm_id, secondary-email, or normalized name.
  const [contact, emailsByContact, auth0Users] = await Promise.all([
    civicrmService.getContactById(contactLookup.contactId),
    civicrmService.getEmailsForContacts([contactLookup.contactId]),
    auth0Service.listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID),
  ]);
  if (!contact) {
    // Race: contact was deleted between findContactIdByAnyEmail and
    // getContactById. Safest action is to proceed with normal claim flow
    // (which will re-check CiviCRM and bail out or create).
    logger.warn(
      { emailHash, contactId: contactLookup.contactId },
      'Claim: CiviCRM contact disappeared between lookups'
    );
    return 'proceed';
  }
  const contactEmails = emailsByContact.get(contactLookup.contactId);
  const maps = buildAuth0Maps(auth0Users);
  const ladderFellow: LadderFellow = {
    civicrmId: contactLookup.contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    primaryEmail: contactEmails?.primary ?? null,
    secondaries: contactEmails?.secondaries ?? [],
  };
  const match = reconcile(ladderFellow, maps);

  if (match.status === 'no-account') {
    // Ladder confirms: no prior Auth0 account anywhere. Caller creates fresh.
    return 'proceed';
  }

  // Fetch fellowships so the audit rows below record real hasFellowship /
  // hasCurrentFellowship flags instead of hard-coded false. Shared between
  // the 'active'/'active-different-email' and 'needs-review' branches.
  const fellowships = await civicrmService.getFellowships(contactLookup.contactId);
  const hasFellowship = fellowships.length > 0;
  const hasCurrentFellowship = fellowships.some(
    (f) => classifyFellowship(f.startDate, f.endDate) === 'current'
  );

  if (match.status === 'active' || match.status === 'active-different-email') {
    // Returning fellow — use the matched Auth0 user's email for the reset,
    // not the claimant's typed email. If they no longer control that mailbox,
    // the IT notification is their path back to a working account.
    const matched = match.matched;
    logger.info(
      {
        emailHash,
        matchedAuth0UserId: matched.userId,
        matchedEmailHash: hashEmail(matched.email),
        matchedVia: match.matchedVia,
        civicrmId: contactLookup.contactId,
      },
      'Claim: ladder matched existing Auth0 account — sending password reset'
    );
    await auth0Service.triggerPasswordSetupEmail(matched.email);
    await emailService.sendClaimNeedsReconciliationNotification({
      claimantEmail: email,
      reason: 'returning-fellow-reset-sent',
      candidates: [matched],
      resetSentTo: matched.email,
    });
    // Audit row — DB is the source of truth for "a claim happened."
    try {
      await prisma.vitIdClaim.create({
        data: {
          email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          civicrmId: contactLookup.contactId,
          hasFellowship,
          hasCurrentFellowship,
          rolesAssigned: [],
          orgsAssigned: [],
        },
      });
    } catch (err) {
      logger.error(
        { err, emailHash },
        'Claim: failed to persist audit row for returning-fellow branch'
      );
    }
    return 'handled';
  }

  // match.status === 'needs-review'
  // Refuse to guess. IT gets the notification + audit row; claimant sees no
  // change (they hit the normal "processing" flow but no account is created).
  logger.warn(
    {
      emailHash,
      reason: match.reason,
      candidateCount: match.candidates.length,
      civicrmId: contactLookup.contactId,
    },
    'Claim: ladder returned needs-review — refusing to auto-provision'
  );
  await emailService.sendClaimNeedsReconciliationNotification({
    claimantEmail: email,
    reason: match.reason,
    candidates: match.candidates,
  });
  try {
    await prisma.vitIdClaim.create({
      data: {
        email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        civicrmId: contactLookup.contactId,
        hasFellowship,
        hasCurrentFellowship,
        rolesAssigned: [],
        orgsAssigned: [],
      },
    });
  } catch (err) {
    logger.error(
      { err, emailHash },
      'Claim: failed to persist audit row for needs-review branch'
    );
  }
  return 'handled';
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
        fellowshipId: target.fellowship.id,
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
