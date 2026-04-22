import { describe, it, expect } from 'vitest';
import {
  normalize,
  buildAuth0Maps,
  reconcile,
  type LadderFellow,
  type Auth0UserLike,
} from '../../services/vit-id-match.js';

// Fixture helpers to keep tests concise and the setup obvious at the callsite.
function user(
  overrides: Partial<Auth0UserLike> & { user_id: string; email: string }
): Auth0UserLike {
  return { name: undefined, civicrmId: undefined, ...overrides };
}

function fellow(overrides: Partial<LadderFellow> & { civicrmId: number }): LadderFellow {
  return {
    firstName: '',
    lastName: '',
    primaryEmail: null,
    secondaries: [],
    ...overrides,
  };
}

describe('normalize', () => {
  it('returns empty string for empty/null/undefined', () => {
    expect(normalize('')).toBe('');
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });

  it('lowercases', () => {
    expect(normalize('Maria')).toBe('maria');
    expect(normalize('MARIA ROSSI')).toBe('maria rossi');
  });

  it('strips combining marks (accents)', () => {
    expect(normalize('José García')).toBe('jose garcia');
    expect(normalize('Müller')).toBe('muller');
    expect(normalize('Chloé')).toBe('chloe');
    expect(normalize('Ñoño')).toBe('nono');
  });

  it('collapses whitespace and trims', () => {
    expect(normalize('  Maria   Rossi  ')).toBe('maria rossi');
    expect(normalize('Maria\tRossi')).toBe('maria rossi');
  });

  it('ASCII passthrough preserves content', () => {
    expect(normalize('john smith')).toBe('john smith');
  });
});

describe('buildAuth0Maps', () => {
  it('builds email index by lowercased email', () => {
    const maps = buildAuth0Maps([user({ user_id: 'u1', email: 'Foo@Bar.COM' })]);
    expect(maps.byEmail.get('foo@bar.com')?.[0].userId).toBe('u1');
    expect(maps.byEmail.get('Foo@Bar.COM')).toBeUndefined();
  });

  it('builds civicrm_id index and stringifies', () => {
    const maps = buildAuth0Maps([user({ user_id: 'u1', email: 'a@b.c', civicrmId: '42' })]);
    expect(maps.byCivicrmId.get('42')?.[0].userId).toBe('u1');
  });

  it('skips civicrm_id index when civicrmId is missing', () => {
    const maps = buildAuth0Maps([user({ user_id: 'u1', email: 'a@b.c' })]);
    expect(maps.byCivicrmId.size).toBe(0);
  });

  it('skips name index when user.name is absent', () => {
    const maps = buildAuth0Maps([user({ user_id: 'u1', email: 'a@b.c' })]);
    expect(maps.byNormalizedName.size).toBe(0);
  });

  it('groups multiple users with the same normalized name', () => {
    const maps = buildAuth0Maps([
      user({ user_id: 'u1', email: 'a@b.c', name: 'Maria Rossi' }),
      user({ user_id: 'u2', email: 'd@e.f', name: 'MARIA  ROSSI' }),
    ]);
    expect(maps.byNormalizedName.get('maria rossi')?.length).toBe(2);
  });

  it('candidate shape includes civicrmId as string or null', () => {
    const maps = buildAuth0Maps([
      user({ user_id: 'u1', email: 'a@b.c', civicrmId: '7' }),
      user({ user_id: 'u2', email: 'd@e.f' }),
    ]);
    expect(maps.byEmail.get('a@b.c')![0].civicrmId).toBe('7');
    expect(maps.byEmail.get('d@e.f')![0].civicrmId).toBeNull();
  });

  it('groups multiple users with the same email (Auth0-side collision)', () => {
    const maps = buildAuth0Maps([
      user({ user_id: 'u1', email: 'shared@x.com' }),
      user({ user_id: 'u2', email: 'shared@x.com' }),
    ]);
    expect(maps.byEmail.get('shared@x.com')?.length).toBe(2);
  });

  it('groups multiple users with the same civicrm_id (Auth0-side collision)', () => {
    const maps = buildAuth0Maps([
      user({ user_id: 'u1', email: 'a@x.com', civicrmId: '100' }),
      user({ user_id: 'u2', email: 'b@x.com', civicrmId: '100' }),
    ]);
    expect(maps.byCivicrmId.get('100')?.length).toBe(2);
  });
});

describe('reconcile', () => {
  // Fellow A: matched via civicrm_id
  it('R2: fellow has VIT ID under different email via civicrm_id', () => {
    const fellowA = fellow({
      civicrmId: 100,
      firstName: 'Alice',
      lastName: 'Adams',
      primaryEmail: 'new@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|alice', email: 'old@x.com', name: 'Alice Adams', civicrmId: '100' }),
    ]);

    const match = reconcile(fellowA, maps);

    expect(match.status).toBe('active-different-email');
    if (match.status === 'active-different-email') {
      expect(match.matchedVia).toBe('civicrm-id');
      expect(match.matched.email).toBe('old@x.com');
    }
  });

  // Fellow B: matched via secondary email
  it('R3: single secondary-email hit', () => {
    const fellowB = fellow({
      civicrmId: 200,
      firstName: 'Bob',
      lastName: 'Brown',
      primaryEmail: 'new@y.com',
      secondaries: ['old@y.com'],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|bob', email: 'old@y.com', name: 'Bob Brown' }),
    ]);

    const match = reconcile(fellowB, maps);

    expect(match.status).toBe('active-different-email');
    if (match.status === 'active-different-email') {
      expect(match.matchedVia).toBe('secondary-email');
      expect(match.matched.email).toBe('old@y.com');
      expect(match.matchedViaEmail).toBe('old@y.com');
    }
  });

  // Fellow C: name-collision
  it('R4: >1 Auth0 users share the same normalized name → needs-review', () => {
    const fellowC = fellow({
      civicrmId: 300,
      firstName: 'Maria',
      lastName: 'Rossi',
      primaryEmail: 'maria.rossi.new@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|maria1', email: 'maria1@x.com', name: 'Maria Rossi' }),
      user({ user_id: 'auth0|maria2', email: 'maria2@x.com', name: 'MARIA ROSSI' }),
    ]);

    const match = reconcile(fellowC, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('name-collision');
      expect(match.candidates).toHaveLength(2);
    }
  });

  // Fellow D: no-account
  it('R5: no tier matches', () => {
    const fellowD = fellow({
      civicrmId: 400,
      firstName: 'New',
      lastName: 'Comer',
      primaryEmail: 'newcomer@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|other', email: 'other@x.com', name: 'Other Person' }),
    ]);

    const match = reconcile(fellowD, maps);

    expect(match.status).toBe('no-account');
  });

  // Fellow E: tier-conflict (civicrm_id vs secondary email disagree)
  it('R2: tier-conflict when civicrm_id and secondary email disagree', () => {
    const fellowE = fellow({
      civicrmId: 500,
      firstName: 'Ed',
      lastName: 'Eve',
      primaryEmail: 'no-auth0-hit@x.com',
      secondaries: ['old@y.com'],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|X', email: 'x@x.com', civicrmId: '500' }),
      user({ user_id: 'auth0|Y', email: 'old@y.com' }),
    ]);

    const match = reconcile(fellowE, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('tier-conflict');
      expect(match.candidates.map((c) => c.userId).sort()).toEqual(['auth0|X', 'auth0|Y']);
    }
  });

  // Fellow F: primary-conflict (tier1 vs tier2 disagree)
  it('R1: primary-conflict when primary email and civicrm_id point to different users', () => {
    const fellowF = fellow({
      civicrmId: 600,
      firstName: 'Frank',
      lastName: 'Foo',
      primaryEmail: 'new@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|X', email: 'new@x.com' }),
      user({ user_id: 'auth0|Y', email: 'old@x.com', civicrmId: '600' }),
    ]);

    const match = reconcile(fellowF, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('primary-conflict');
      expect(match.candidates.map((c) => c.userId).sort()).toEqual(['auth0|X', 'auth0|Y']);
    }
  });

  it('R1 ignores tier3/tier4 hits when tier1 wins', () => {
    // Design decision: when primary email hits, we don't escalate on secondary
    // or name disagreements. That noise is someone else's problem.
    const fellowG = fellow({
      civicrmId: 700,
      firstName: 'Grace',
      lastName: 'Grey',
      primaryEmail: 'grace@x.com',
      secondaries: ['some-other@y.com'],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|grace', email: 'grace@x.com' }),
      user({ user_id: 'auth0|noise', email: 'some-other@y.com' }),
      user({ user_id: 'auth0|samename', email: 'x@y.z', name: 'Grace Grey' }),
    ]);

    const match = reconcile(fellowG, maps);

    expect(match.status).toBe('active');
    if (match.status === 'active') {
      expect(match.matched.userId).toBe('auth0|grace');
    }
  });

  it('empty primary email: ladder skips tier 1', () => {
    const fellowNoPrimary = fellow({
      civicrmId: 800,
      firstName: 'Henry',
      lastName: 'Hill',
      primaryEmail: '',
      secondaries: [],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|henry', email: 'henry@x.com', civicrmId: '800' }),
    ]);

    const match = reconcile(fellowNoPrimary, maps);

    expect(match.status).toBe('active-different-email');
    if (match.status === 'active-different-email') {
      expect(match.matchedVia).toBe('civicrm-id');
    }
  });

  it('R3 tier-conflict when secondary emails resolve to multiple distinct userIds', () => {
    const fellowMulti = fellow({
      civicrmId: 900,
      firstName: 'Ida',
      lastName: 'Ivers',
      primaryEmail: 'miss@x.com',
      secondaries: ['s1@x.com', 's2@x.com'],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|a', email: 's1@x.com' }),
      user({ user_id: 'auth0|b', email: 's2@x.com' }),
    ]);

    const match = reconcile(fellowMulti, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('tier-conflict');
      expect(match.candidates.map((c) => c.userId).sort()).toEqual(['auth0|a', 'auth0|b']);
    }
  });

  it('R3 deduplicates by userId when multiple secondaries hit the same user', () => {
    // Not a conflict — same person has two secondary emails on file.
    const fellow2 = fellow({
      civicrmId: 1000,
      firstName: 'Jane',
      lastName: 'Jones',
      primaryEmail: 'miss@x.com',
      secondaries: ['alias1@x.com', 'alias2@x.com'],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|jane', email: 'alias1@x.com' }),
      user({ user_id: 'auth0|jane', email: 'alias2@x.com' }),
    ]);
    // This construction is artificial; in reality one Auth0 user has one email.
    // Simulating it tests the dedup invariant regardless.

    const match = reconcile(fellow2, maps);

    // Map keyed by email, last write wins, so only one candidate exists.
    // The test verifies the ladder handles the single-hit case cleanly.
    expect(match.status).toBe('active-different-email');
  });

  it('R4 single name match when no email/civicrm_id hits', () => {
    const fellow2 = fellow({
      civicrmId: 1100,
      firstName: 'Kay',
      lastName: 'Kim',
      primaryEmail: 'no-match@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|kay', email: 'kay@old.com', name: 'Kay Kim' }),
    ]);

    const match = reconcile(fellow2, maps);

    expect(match.status).toBe('active-different-email');
    if (match.status === 'active-different-email') {
      expect(match.matchedVia).toBe('name');
    }
  });

  it('auth0-collision on tier 1: two Auth0 users share the primary email', () => {
    const f = fellow({
      civicrmId: 1,
      firstName: 'Alice',
      lastName: 'Adams',
      primaryEmail: 'shared@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|a', email: 'shared@x.com' }),
      user({ user_id: 'auth0|b', email: 'shared@x.com' }),
    ]);

    const match = reconcile(f, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('auth0-collision');
      expect(match.candidates.map((c) => c.userId).sort()).toEqual(['auth0|a', 'auth0|b']);
    }
  });

  it('auth0-collision on tier 2: two Auth0 users share the civicrm_id', () => {
    const f = fellow({
      civicrmId: 100,
      firstName: 'Bob',
      lastName: 'Brown',
      primaryEmail: 'miss@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|a', email: 'a@x.com', civicrmId: '100' }),
      user({ user_id: 'auth0|b', email: 'b@x.com', civicrmId: '100' }),
    ]);

    const match = reconcile(f, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('auth0-collision');
    }
  });

  it('auth0-collision surfaces from tier 3 only when no other tier matched', () => {
    const f = fellow({
      civicrmId: 200,
      firstName: 'Carol',
      lastName: 'Cox',
      primaryEmail: 'miss@x.com',
      secondaries: ['shared-old@x.com'],
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|x', email: 'shared-old@x.com' }),
      user({ user_id: 'auth0|y', email: 'shared-old@x.com' }),
    ]);

    const match = reconcile(f, maps);

    expect(match.status).toBe('needs-review');
    if (match.status === 'needs-review') {
      expect(match.reason).toBe('auth0-collision');
    }
  });

  it('civicrm_id type coercion: number on fellow, string in Auth0 metadata', () => {
    // Regression: CiviCRM emits Number(entity_id); Auth0 stores String(civicrm_id).
    // Both sides must key to the same Map entry.
    const fellow2 = fellow({
      civicrmId: 42, // number
      firstName: 'Leo',
      lastName: 'Leon',
      primaryEmail: 'miss@x.com',
    });
    const maps = buildAuth0Maps([
      user({ user_id: 'auth0|leo', email: 'leo@x.com', civicrmId: '42' }), // string
    ]);

    const match = reconcile(fellow2, maps);

    expect(match.status).toBe('active-different-email');
    if (match.status === 'active-different-email') {
      expect(match.matchedVia).toBe('civicrm-id');
    }
  });
});
