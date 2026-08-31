import * as civicrmService from './civicrm.service.js';
import { logger } from '../lib/logger.js';

export type CachedFellow = { contactId: number; firstName: string; lastName: string };

const FELLOWS_CACHE_TTL_MS = 120_000;
// Overall deadline for one roster refresh. The CiviCRM client aborts each
// underlying request at 10s, but a paginated roster fetch is several requests;
// this bounds the whole refresh so admin pages fail fast instead of hanging.
const FELLOWS_FETCH_DEADLINE_MS = 30_000;

let cachedFellows: CachedFellow[] | null = null;
let cachedFellowsExpires = 0;
let inFlight: Promise<CachedFellow[]> | null = null;

/**
 * Process-wide 120s TTL cache of the CiviCRM fellows roster, used by the admin
 * routes to join contact names onto rows without a per-request round-trip.
 *
 * Stampede protection: concurrent misses share ONE upstream fetch (`inFlight`)
 * instead of each calling CiviCRM — previously N admin tabs on an expired
 * cache meant N full roster fetches against a rate-limited API.
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
 */
export async function getFellowsCached(logLabel: string): Promise<CachedFellow[]> {
  const now = Date.now();
  if (cachedFellows && now < cachedFellowsExpires) return cachedFellows;

  if (!inFlight) {
    inFlight = refreshRoster(logLabel).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function refreshRoster(logLabel: string): Promise<CachedFellow[]> {
  let deadline: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(
      () => reject(new Error('fellows roster refresh timed out')),
      FELLOWS_FETCH_DEADLINE_MS
    );
  });

  try {
    const fellows = await Promise.race([civicrmService.getFellowsWithContacts(), timeout]);
    if (fellows.length === 0) {
      logger.warn(`${logLabel}: fellows roster empty — not caching`);
      return fellows;
    }
    cachedFellows = fellows;
    cachedFellowsExpires = Date.now() + FELLOWS_CACHE_TTL_MS;
    return fellows;
  } finally {
    clearTimeout(deadline);
  }
}
