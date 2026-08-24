import * as civicrmService from '../services/civicrm.service.js';
import { logger } from './logger.js';

export type CachedFellow = { contactId: number; firstName: string; lastName: string };

const FELLOWS_CACHE_TTL_MS = 120_000;

let cachedFellows: CachedFellow[] | null = null;
let cachedFellowsExpires = 0;

/**
 * Process-wide 120s TTL cache of the CiviCRM fellows roster, used by the admin
 * routes to join contact names onto rows without a per-request round-trip.
 *
 * Cache-poisoning guard: a transient CiviCRM hiccup can return 200 with
 * `{ values: [] }`, which the service maps to `[]`. Caching that empty result
 * for the full TTL would label every row "Contact #<id>" with nothing to
 * indicate why, so an empty roster is treated as non-cacheable — the next
 * request retries until CiviCRM returns real data.
 *
 * `logLabel` distinguishes the empty-response warning by call site (forms vs
 * email log) so the source is clear in the logs.
 *
 * Single-instance only, like the other in-memory caches — see the
 * single-instance constraint in DEPLOYMENT.md.
 *
 * NOTE: no in-flight coalescing yet; concurrent misses each call CiviCRM. That
 * stampede-protection follow-up is tracked in TODOS.md.
 */
export async function getFellowsCached(logLabel: string): Promise<CachedFellow[]> {
  const now = Date.now();
  if (cachedFellows && now < cachedFellowsExpires) return cachedFellows;

  const fellows = await civicrmService.getFellowsWithContacts();
  if (fellows.length === 0) {
    logger.warn(`${logLabel}: fellows roster empty — not caching`);
    return fellows;
  }

  cachedFellows = fellows;
  cachedFellowsExpires = now + FELLOWS_CACHE_TTL_MS;
  return fellows;
}
