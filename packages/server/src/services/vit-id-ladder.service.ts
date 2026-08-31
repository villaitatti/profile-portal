import { env } from '../env.js';
import * as auth0Service from './auth0.service.js';
import * as civicrmService from './civicrm.service.js';
import { buildAuth0Maps, reconcile, type Auth0Maps, type LadderFellow } from './vit-id-match.js';
import type { CiviCRMContact, FellowMatch } from '@itatti/shared';

/**
 * I/O orchestration around the pure 4-tier match ladder (vit-id-match.ts).
 *
 * This module is the ONLY place that assembles ladder inputs (Auth0 role
 * users + CiviCRM contact/email rows) into a reconcile() call. It used to be
 * written three times — in the claim flow, the appointee-email eligibility
 * evaluators, and the vit-id-lookup route — which meant every fix to the
 * assembly had to be made three times.
 *
 * Two entry points, differing in what the caller already knows:
 *  - runLadderForContactId: caller has only a contact id (the email-first
 *    flows resolve the id via findContactIdByAnyEmail and keep their own
 *    domain semantics for duplicate / not-found).
 *  - matchKnownContact: caller already fetched the contact (dashboard and
 *    email-eligibility paths) — avoids a redundant getContactById.
 */

/**
 * Prefetched Auth0 side of the ladder. Build once per batch (e.g. one email
 * dispatch run) and pass to every match call — without this, a dispatch of N
 * emails performed N full Auth0 role scans against a rate-limited API.
 */
export async function buildLadderContext(): Promise<Auth0Maps> {
  const auth0Users = await auth0Service.listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID);
  return buildAuth0Maps(auth0Users);
}

/**
 * Full ladder for a contact id: fetches the contact, its email rows, and the
 * Auth0 fellows (unless a prefetched context is supplied), then reconciles.
 *
 * `contact: null` in the result signals the contact disappeared between the
 * caller's lookup and ours (deletion race); the match degrades to no-account
 * and callers decide how loudly to react.
 */
export async function runLadderForContactId(
  contactId: number,
  maps?: Auth0Maps
): Promise<{ match: FellowMatch; contact: CiviCRMContact | null }> {
  const [contact, emailsByContact, resolvedMaps] = await Promise.all([
    civicrmService.getContactById(contactId),
    civicrmService.getEmailsForContacts([contactId]),
    maps ? Promise.resolve(maps) : buildLadderContext(),
  ]);
  if (!contact) {
    return { match: { status: 'no-account' }, contact: null };
  }
  const contactEmails = emailsByContact.get(contactId);
  const ladderFellow: LadderFellow = {
    civicrmId: contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    primaryEmail: contactEmails?.primary ?? null,
    secondaries: contactEmails?.secondaries ?? [],
  };
  return { match: reconcile(ladderFellow, resolvedMaps), contact };
}

/**
 * Full ladder for an already-fetched contact. Returns the FellowMatch so
 * callers can distinguish needs-review (refuse politely) from no-account
 * (a VIT invitation is appropriate).
 */
export async function matchKnownContact(
  contactId: number,
  contact: { firstName: string; lastName: string; email: string },
  maps?: Auth0Maps
): Promise<FellowMatch> {
  const [resolvedMaps, contactEmails] = await Promise.all([
    maps ? Promise.resolve(maps) : buildLadderContext(),
    civicrmService.getEmailsForContacts([contactId]),
  ]);
  const emails = contactEmails.get(contactId);
  const ladderFellow: LadderFellow = {
    civicrmId: contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    // No fallback to contact.email — if Email.get returned nothing for this
    // contact (all on_hold), we don't want to match against the held primary.
    primaryEmail: emails?.primary ?? null,
    secondaries: emails?.secondaries ?? [],
  };
  return reconcile(ladderFellow, resolvedMaps);
}
