// VIT ID match ladder — pure module.
//
// Reconciles a CiviCRM fellow against the set of Auth0 users in the fellows
// role across four deterministic + probabilistic tiers. Pure functions only,
// no network I/O — tests import directly.
//
// See ~/.gstack/projects/villaitatti-profile-portal/
//   acaselli-fix-appointee-email-redirect-dev-guard-design-*.md
// for the full design + reconciliation rules.
//
// Data flow:
//
//   CiviCRM                       Auth0 (fellows role)
//   +--------------+              +--------------------+
//   | contactId    |              | user_id            |
//   | firstName    |              | email              |
//   | lastName     |              | name               |
//   | primaryEmail |              | civicrmId          |
//   | secondaries  |              +--------------------+
//   +--------------+                         |
//          |                                 v
//          |                        buildAuth0Maps(users)
//          |                        +----------------------+
//          |                        | auth0ByEmail         |
//          |                        | auth0ByCivicrmId     |
//          |                        | auth0ByNormalizedName|
//          |                        +----------------------+
//          v                                 |
//    For each fellow -----------------------+
//          |                                 |
//          v                                 |
//   +-------------------------------------------------+
//   | reconcile(fellow, maps): FellowMatch            |
//   |                                                 |
//   |  Tier 1: primary email  --+                     |
//   |  Tier 2: civicrm_id      -+                     |
//   |  Tier 3: secondary emails +--> Rules R1..R5     |
//   |  Tier 4: normalized name -+                     |
//   +-------------------------------------------------+

import type {
  Auth0Candidate,
  FellowMatch,
  NeedsReviewReason,
} from '@itatti/shared';

export interface LadderFellow {
  civicrmId: number;
  firstName: string;
  lastName: string;
  primaryEmail: string | null;
  secondaries: string[];
}

export interface Auth0UserLike {
  user_id: string;
  email: string;
  name?: string;
  civicrmId?: string;
}

/**
 * Lookup Maps over the Auth0 fellow user set.
 *
 * All three are `Map<K, Auth0Candidate[]>` so the ladder can detect Auth0-side
 * collisions (two users sharing an email or a civicrm_id) and surface them as
 * `'needs-review'` with `reason: 'auth0-collision'`. Last-write-wins on a
 * regular Map would silently misroute.
 */
export interface Auth0Maps {
  byEmail: Map<string, Auth0Candidate[]>;
  byCivicrmId: Map<string, Auth0Candidate[]>;
  byNormalizedName: Map<string, Auth0Candidate[]>;
}

/**
 * Normalize a string for name-tier matching.
 *
 * - lowercases
 * - NFD-decomposes Unicode then strips combining marks (accents/diacritics)
 * - collapses whitespace
 * - trims
 *
 * Returns '' for null/undefined/empty inputs. Callers treat '' as "no key"
 * and skip indexing that user.
 */
export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCandidate(u: Auth0UserLike): Auth0Candidate {
  return {
    userId: u.user_id,
    email: u.email,
    civicrmId: u.civicrmId ?? null,
    name: u.name ?? null,
  };
}

/**
 * Build the three lookup Maps from a list of Auth0 users.
 *
 * civicrm_id key normalization: Auth0 stores it as a string
 * (auth0.service.ts), CiviCRM emits it as a number. We key on string form.
 */
export function buildAuth0Maps(users: Auth0UserLike[]): Auth0Maps {
  const byEmail = new Map<string, Auth0Candidate[]>();
  const byCivicrmId = new Map<string, Auth0Candidate[]>();
  const byNormalizedName = new Map<string, Auth0Candidate[]>();

  const pushInto = (
    map: Map<string, Auth0Candidate[]>,
    key: string,
    cand: Auth0Candidate
  ) => {
    const existing = map.get(key) ?? [];
    existing.push(cand);
    map.set(key, existing);
  };

  for (const u of users) {
    const cand = toCandidate(u);

    const emailKey = u.email?.toLowerCase();
    if (emailKey) pushInto(byEmail, emailKey, cand);

    if (u.civicrmId) pushInto(byCivicrmId, String(u.civicrmId), cand);

    const nameKey = normalize(u.name);
    if (nameKey) pushInto(byNormalizedName, nameKey, cand);
  }

  return { byEmail, byCivicrmId, byNormalizedName };
}

/**
 * Run the four-tier match ladder for a single fellow.
 *
 * R1 — primary email (tier 1) wins, checked against tier 2 for
 *      primary-conflict. Tiers 3/4 explicitly ignored at this level.
 * R2 — civicrm_id (tier 2) wins, checked against tiers 3/4 for tier-conflict.
 * R3 — secondary email (tier 3) — single distinct userId wins; multi → conflict.
 * R4 — normalized name (tier 4) — single candidate wins; multi → name-collision.
 * R5 — no match.
 */
export function reconcile(fellow: LadderFellow, maps: Auth0Maps): FellowMatch {
  // Tier 1: primary email. Array — an Auth0-side collision here means two
  // users have the same email, which is a bug we refuse to guess past.
  const tier1Hits = fellow.primaryEmail
    ? maps.byEmail.get(fellow.primaryEmail.toLowerCase()) ?? []
    : [];
  if (tier1Hits.length > 1) {
    return { status: 'needs-review', reason: 'auth0-collision', candidates: tier1Hits };
  }
  const tier1 = tier1Hits[0] ?? null;

  // Tier 2: civicrm_id. Array — collision means two Auth0 users metadata-point
  // at the same CiviCRM contact. Also refuse to guess.
  const tier2Hits = maps.byCivicrmId.get(String(fellow.civicrmId)) ?? [];
  if (tier2Hits.length > 1) {
    return { status: 'needs-review', reason: 'auth0-collision', candidates: tier2Hits };
  }
  const tier2 = tier2Hits[0] ?? null;

  // Tier 3: secondary emails. Each secondary lookup can return multiple
  // Auth0 users (email collision); those are also auth0-collision, surfaced
  // when tier 3 would have been the decisive tier.
  const tier3: { user: Auth0Candidate; viaEmail: string }[] = [];
  let tier3EmailCollision: Auth0Candidate[] | null = null;
  for (const secondary of fellow.secondaries) {
    const hits = maps.byEmail.get(secondary.toLowerCase()) ?? [];
    if (hits.length > 1) {
      // Record the collision; only matters if tier 3 ends up the decisive tier.
      if (!tier3EmailCollision) tier3EmailCollision = hits;
      continue;
    }
    if (hits.length === 1) tier3.push({ user: hits[0], viaEmail: secondary });
  }

  const nameKey = normalize(`${fellow.firstName} ${fellow.lastName}`);
  const tier4 = nameKey ? maps.byNormalizedName.get(nameKey) ?? [] : [];

  // R1: tier1 wins. Only check for primary-conflict against tier2.
  // Tiers 3/4 are deliberately ignored here.
  if (tier1) {
    if (tier2 && tier2.userId !== tier1.userId) {
      return {
        status: 'needs-review',
        reason: 'primary-conflict',
        candidates: [tier1, tier2],
      };
    }
    return { status: 'active', matchedVia: 'primary-email', matched: tier1 };
  }

  // R2: tier2 wins. Check tiers 3/4 for tier-conflict.
  if (tier2) {
    const conflictingIds = new Set<string>();
    const conflicting: Auth0Candidate[] = [];
    for (const hit of tier3) {
      if (hit.user.userId !== tier2.userId && !conflictingIds.has(hit.user.userId)) {
        conflictingIds.add(hit.user.userId);
        conflicting.push(hit.user);
      }
    }
    for (const user of tier4) {
      if (user.userId !== tier2.userId && !conflictingIds.has(user.userId)) {
        conflictingIds.add(user.userId);
        conflicting.push(user);
      }
    }
    if (conflicting.length > 0) {
      return {
        status: 'needs-review',
        reason: 'tier-conflict',
        candidates: [tier2, ...conflicting],
      };
    }
    return { status: 'active-different-email', matchedVia: 'civicrm-id', matched: tier2 };
  }

  // R3: tier3 — collapse to distinct userIds.
  if (tier3.length > 0) {
    const distinctByUserId = new Map<string, { user: Auth0Candidate; viaEmail: string }>();
    for (const hit of tier3) {
      if (!distinctByUserId.has(hit.user.userId)) distinctByUserId.set(hit.user.userId, hit);
    }
    if (distinctByUserId.size === 1) {
      const only = distinctByUserId.values().next().value!;
      return {
        status: 'active-different-email',
        matchedVia: 'secondary-email',
        matched: only.user,
        matchedViaEmail: only.viaEmail,
      };
    }
    return {
      status: 'needs-review',
      reason: 'tier-conflict',
      candidates: Array.from(distinctByUserId.values()).map((h) => h.user),
    };
  }

  // Tier 3 had only collisions (no clean single-user hits) and no other tier
  // resolved. Surface the collision now rather than silently falling through.
  if (tier3EmailCollision) {
    return {
      status: 'needs-review',
      reason: 'auth0-collision',
      candidates: tier3EmailCollision,
    };
  }

  // R4: tier4 — exactly one candidate wins; multiple → name-collision.
  if (tier4.length === 1) {
    return { status: 'active-different-email', matchedVia: 'name', matched: tier4[0] };
  }
  if (tier4.length > 1) {
    return { status: 'needs-review', reason: 'name-collision', candidates: tier4 };
  }

  // R5: no match.
  return { status: 'no-account' };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled NeedsReviewReason: ${String(x)}`);
}

/**
 * Classify a NeedsReviewReason by whether it's a user-facing "show the
 * candidates and let a human decide" case vs. a data-integrity alert.
 *
 * Implemented as an exhaustive switch with an `assertNever` default so
 * TypeScript flags any newly-added `NeedsReviewReason` variant that isn't
 * explicitly handled here — caller semantics (e.g., the claim flow IT
 * notification) depend on this classification, so a silent fall-through
 * would be a real bug.
 */
export function isHumanPickable(reason: NeedsReviewReason): boolean {
  switch (reason) {
    case 'name-collision':
    case 'tier-conflict':
    case 'primary-conflict':
    case 'duplicate-civicrm-contact':
    case 'auth0-collision':
      return true;
    default:
      return assertNever(reason);
  }
}
