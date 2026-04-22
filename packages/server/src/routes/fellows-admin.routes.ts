import { Router } from 'express';
import { z } from 'zod';
import { env, isDevMode } from '../env.js';
import { getFellowsDashboard } from '../services/fellows.service.js';
import * as appointeeEmailService from '../services/appointee-email.service.js';
import * as civicrmService from '../services/civicrm.service.js';
import { listUsersByRole } from '../services/auth0.service.js';
import { buildAuth0Maps, normalize, reconcile, type LadderFellow } from '../services/vit-id-match.js';
import { logger } from '../lib/logger.js';
import type {
  Auth0Candidate,
  FellowMatch,
  FellowsDashboardResponse,
  VitIdLookupResponse,
} from '@itatti/shared';

const router = Router();

function getDevMockData(academicYear?: string): FellowsDashboardResponse {
  const mockBioEmail = (variant: 'none' | 'pending' | 'sent' | 'failed', canSend: boolean, year: string) => ({
    status: variant,
    sentAt: variant === 'sent' ? '2026-04-10T09:00:00.000Z' : null,
    targetAcademicYear: year,
    canManuallySend: canSend,
  });
  const fellows: FellowsDashboardResponse['fellows'] = [
    // Classic 'no-account' — first-time fellow, never been here before
    { civicrmId: 1, firstName: 'Maria', lastName: 'Rossi', email: 'm.rossi@unifi.it', appointment: 'Fellow', fellowship: 'NEH Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 2, firstName: 'James', lastName: 'Chen', email: 'jchen@princeton.edu', appointment: 'Fellow', fellowship: 'Mellon Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // Classic 'active' — matched via primary email
    { civicrmId: 3, firstName: 'Sophie', lastName: 'Laurent', email: 's.laurent@sorbonne.fr', appointment: 'Visiting Fellow', fellowship: 'Berenson Fellow', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|sophie', email: 's.laurent@sorbonne.fr', civicrmId: '3', name: 'Sophie Laurent' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('sent', false, '2025-2026') },
    { civicrmId: 4, firstName: 'Alessandro', lastName: 'Bianchi', email: 'a.bianchi@uniroma1.it', appointment: 'Fellow', fellowship: 'Hanna Kiel Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // 'active' but civicrmId metadata missing — pre-existing flag
    { civicrmId: 5, firstName: 'Elena', lastName: 'Petrova', email: 'e.petrova@msu.ru', appointment: 'Visiting Fellow', fellowship: 'Wallace Fellow', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|elena', email: 'e.petrova@msu.ru', civicrmId: null, name: 'Elena Petrova' }, civicrmIdStatus: 'missing', bioEmail: mockBioEmail('pending', false, '2025-2026') },
    { civicrmId: 6, firstName: 'David', lastName: 'Williams', email: 'd.williams@yale.edu', appointment: 'Fellow', fellowship: 'Robert Lehman Fellow', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|david', email: 'd.williams@yale.edu', civicrmId: '6', name: 'David Williams' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('failed', true, '2025-2026') },
    { civicrmId: 7, firstName: 'Lucia', lastName: 'Moreno', email: 'l.moreno@csic.es', appointment: 'Fellow', fellowship: 'CRIA Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'active-different-email' via civicrm_id (returning fellow, email changed)
    { civicrmId: 8, firstName: 'Thomas', lastName: 'Müller', email: 't.mueller.new@uni-heidelberg.de', appointment: 'Fellow', fellowship: 'Florence Gould Fellow', fellowshipYear: '2024-2025', status: 'active-different-email', matchedVia: 'civicrm-id', matched: { userId: 'auth0|thomas', email: 't.mueller@old-university.edu', civicrmId: '8', name: 'Thomas Müller' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('none', false, '2024-2025') },

    // NEW — 'active-different-email' via secondary-email
    { civicrmId: 11, firstName: 'Isabella', lastName: 'Ferrari', email: 'i.ferrari.new@unimi.it', appointment: 'Fellow', fellowship: 'Lila Wallace Fellow', fellowshipYear: '2025-2026', status: 'active-different-email', matchedVia: 'secondary-email', matched: { userId: 'auth0|isabella', email: 'i.ferrari.old@unimi.it', civicrmId: null, name: 'Isabella Ferrari' }, matchedViaEmail: 'i.ferrari.old@unimi.it', civicrmIdStatus: 'missing', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'active-different-email' via name (probable match)
    { civicrmId: 12, firstName: 'Henrik', lastName: 'Nielsen', email: 'h.nielsen@ku.dk', appointment: 'Visiting Professor', fellowship: 'Villa I Tatti Visiting Professor', fellowshipYear: '2025-2026', status: 'active-different-email', matchedVia: 'name', matched: { userId: 'auth0|henrik', email: 'henrik.n@gmail.com', civicrmId: null, name: 'Henrik Nielsen' }, civicrmIdStatus: 'missing', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'needs-review' with name-collision
    { civicrmId: 13, firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@unipd.it', appointment: 'Fellow', fellowship: 'Ahmanson Fellow', fellowshipYear: '2025-2026', status: 'needs-review', reason: 'name-collision', candidates: [
      { userId: 'auth0|marco1', email: 'marco.rossi.a@old.com', civicrmId: null, name: 'Marco Rossi' },
      { userId: 'auth0|marco2', email: 'marco.rossi.b@old.com', civicrmId: '999', name: 'Marco Rossi' },
    ], civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'needs-review' with tier-conflict
    { civicrmId: 14, firstName: 'Sarah', lastName: 'O\'Brien', email: 'sarah@trinitycollege.ie', appointment: 'Fellow', fellowship: 'CRIA Fellow', fellowshipYear: '2025-2026', status: 'needs-review', reason: 'tier-conflict', candidates: [
      { userId: 'auth0|sarah-civi', email: 'sarah.old@dublin.edu', civicrmId: '14', name: 'Sarah O\'Brien' },
      { userId: 'auth0|sarah-sec', email: 'sarah.maiden@old.com', civicrmId: null, name: 'Sarah Kelly' },
    ], civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'needs-review' with primary-conflict (data drift)
    { civicrmId: 15, firstName: 'Giovanni', lastName: 'Verdi', email: 'g.verdi@unifi.it', appointment: 'Visiting Fellow', fellowship: 'Wallace Fellow', fellowshipYear: '2025-2026', status: 'needs-review', reason: 'primary-conflict', candidates: [
      { userId: 'auth0|giovanni-1', email: 'g.verdi@unifi.it', civicrmId: null, name: 'Giovanni Verdi' },
      { userId: 'auth0|giovanni-2', email: 'g.verdi.other@unifi.it', civicrmId: '15', name: 'Giovanni Verdi' },
    ], civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    { civicrmId: 9, firstName: 'Chiara', lastName: 'Conti', email: 'c.conti@unibo.it', appointment: 'Fellow', fellowship: 'Ahmanson Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 10, firstName: 'Robert', lastName: 'Taylor', email: 'r.taylor@oxford.ac.uk', appointment: 'Visiting Professor', fellowship: 'Robert Lehman Visiting Professor', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|robert', email: 'r.taylor@oxford.ac.uk', civicrmId: '10', name: 'Robert Taylor' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('none', true, '2025-2026') },
  ];

  const filtered = academicYear
    ? fellows.filter((f) => f.fellowshipYear === academicYear)
    : fellows;

  return {
    fellows: filtered,
    academicYears: ['2025-2026', '2024-2025'],
    summary: {
      total: filtered.length,
      noAccount: filtered.filter((f) => f.status === 'no-account').length,
      active: filtered.filter((f) => f.status === 'active').length,
      activeDifferentEmail: filtered.filter((f) => f.status === 'active-different-email').length,
      needsReview: filtered.filter((f) => f.status === 'needs-review').length,
    },
  };
}

// GET /api/admin/fellows?academicYear=2025-2026
router.get('/', async (req, res, next) => {
  try {
    const academicYear = req.query.academicYear as string | undefined;

    if (isDevMode) {
      res.json(getDevMockData(academicYear));
      return;
    }

    const data = await getFellowsDashboard(academicYear);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/fellows/:contactId/send-bio-email
// Body: { academicYear: "YYYY-YYYY" }
// Returns:
//   200 { eventId, status, sentAt? }             — success (including in-flight PENDING/SENDING)
//   400 { error: "invalid_request", details? }   — malformed :contactId or body failed schema validation
//   400 { reason: BioEmailIneligibilityReason }  — eligibility precondition failed
//                                                  (no_vit_id / no_matching_fellowship / fellowship_not_accepted /
//                                                   no_primary_email / already_sent)
//   500 { error: "internal_error" }              — upstream (CiviCRM / Auth0 / SES) failure
const sendBioEmailBodySchema = z.object({
  academicYear: z.string().regex(/^\d{4}-\d{4}$/),
});

router.post('/:contactId/send-bio-email', async (req, res, next) => {
  try {
    const contactIdRaw = req.params.contactId;
    const contactId = Number(contactIdRaw);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      res
        .status(400)
        .json({ error: 'invalid_request', details: 'contactId must be a positive integer' });
      return;
    }

    const parsed = sendBioEmailBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_request',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    // Dev-mode short-circuit: pretend-send, no DB/CiviCRM/SES touched.
    if (isDevMode) {
      res.json({
        eventId: `dev-${contactId}-${parsed.data.academicYear}`,
        status: 'SENT',
        sentAt: new Date().toISOString(),
      });
      return;
    }

    const result = await appointeeEmailService.sendBioEmailManually({
      contactId,
      academicYear: parsed.data.academicYear,
      triggeredBy: `admin_manual:${req.userId || 'unknown'}`,
    });

    if (!result.ok) {
      res.status(400).json({ reason: result.reason });
      return;
    }

    res.json({
      eventId: result.eventId,
      status: result.status,
      sentAt: result.sentAt ? result.sentAt.toISOString() : null,
    });
  } catch (err) {
    logger.error({ err, contactId: req.params.contactId }, 'Admin: send-bio-email failed');
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/admin/vit-id-lookup?q=<term>
//
// Unified search for the "Has VIT ID?" page. Takes a freeform query:
//   - Looks like an email (contains '@') → reverse match ladder against CiviCRM
//     then Auth0, returns a single FellowMatch verdict.
//   - Otherwise → substring search across name/email on the fellows role,
//     returns a list of candidates.
//
// Response kinds:
//   { kind: 'email-lookup', match: FellowMatch }
//   { kind: 'name-search', candidates: Auth0Candidate[] }
const vitIdLookupQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

// The handler below is exported and mounted in routes/index.ts at
// /api/admin/vit-id-lookup (not under /api/admin/fellows/).
export async function handleVitIdLookup(
  req: import('express').Request,
  res: import('express').Response
): Promise<void> {
  try {
    const parsed = vitIdLookupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_request',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    const q = parsed.data.q.trim();

    if (isDevMode) {
      res.json(getDevVitIdLookupMock(q));
      return;
    }

    const looksLikeEmail = q.includes('@') && q.length > 3;

    if (!looksLikeEmail) {
      // Name search: substring over fellows-role Auth0 users.
      // Use normalize() on both sides so "muller" matches "Müller" and the
      // dev-mode mock and production path stay in sync.
      const users = await listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID);
      const needle = normalize(q);
      const candidates: Auth0Candidate[] = users
        .filter(
          (u) =>
            normalize(u.email).includes(needle) ||
            normalize(u.name ?? '').includes(needle)
        )
        .map((u) => ({
          userId: u.user_id,
          email: u.email,
          civicrmId: u.civicrmId ?? null,
          name: u.name ?? null,
        }));

      const response: VitIdLookupResponse = { kind: 'name-search', candidates };
      res.json(response);
      return;
    }

    // Email lookup: reverse match ladder.
    const match = await runEmailLookupLadder(q);
    const response: VitIdLookupResponse = { kind: 'email-lookup', match };
    res.json(response);
  } catch (err) {
    logger.error({ err, query: req.query }, 'Admin: vit-id-lookup failed');
    res.status(500).json({ error: 'internal_error' });
  }
}

async function runEmailLookupLadder(email: string): Promise<FellowMatch> {
  // Normalize claimant input so case variations (Sophie@X.com vs sophie@x.com)
  // don't silently miss tier 1.
  const emailLower = email.toLowerCase();

  // Parallel: fetch all Auth0 fellows AND reverse-lookup any CiviCRM contact
  // that carries this email on any of their Email rows (primary or secondary).
  const [auth0Users, contactLookup] = await Promise.all([
    listUsersByRole(env.AUTH0_FELLOWS_ROLE_ID),
    civicrmService.findContactIdByAnyEmail(emailLower),
  ]);
  const maps = buildAuth0Maps(auth0Users);

  // CiviCRM data bug: same email on 2+ distinct contacts. Surface before we
  // try to build a LadderFellow (we'd have to pick one contact arbitrarily).
  if (!contactLookup.found && 'duplicate' in contactLookup && contactLookup.duplicate) {
    return {
      status: 'needs-review',
      reason: 'duplicate-civicrm-contact',
      candidates: [],
    };
  }

  // No CiviCRM contact carries this email. Still run tier 1 against Auth0 —
  // covers the "staff typed an email that exists in Auth0 but is not on any
  // CiviCRM contact" case (former fellow who was removed from CiviCRM?).
  if (!contactLookup.found) {
    const tier1Hits = maps.byEmail.get(emailLower) ?? [];
    if (tier1Hits.length === 1) {
      return { status: 'active', matchedVia: 'primary-email', matched: tier1Hits[0] };
    }
    if (tier1Hits.length > 1) {
      return { status: 'needs-review', reason: 'auth0-collision', candidates: tier1Hits };
    }
    return { status: 'no-account' };
  }

  // Build a synthetic LadderFellow from the matched CiviCRM contact and hand
  // off to reconcile(). This gives the Has VIT ID page the SAME 4-tier verdict
  // the dashboard would produce for the same contact.
  const [contact, emailsByContact] = await Promise.all([
    civicrmService.getContactById(contactLookup.contactId),
    civicrmService.getEmailsForContacts([contactLookup.contactId]),
  ]);
  if (!contact) {
    // Race: contact was deleted between the two calls. Degrade gracefully.
    return { status: 'no-account' };
  }
  const contactEmails = emailsByContact.get(contactLookup.contactId);
  const ladderFellow: LadderFellow = {
    civicrmId: contactLookup.contactId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    primaryEmail: contactEmails?.primary ?? null,
    secondaries: contactEmails?.secondaries ?? [],
  };
  return reconcile(ladderFellow, maps);
}

function getDevVitIdLookupMock(q: string): VitIdLookupResponse {
  const looksLikeEmail = q.includes('@');

  if (!looksLikeEmail) {
    // Simple substring dev mock.
    const all: Auth0Candidate[] = [
      { userId: 'auth0|sophie', email: 's.laurent@sorbonne.fr', civicrmId: '3', name: 'Sophie Laurent' },
      { userId: 'auth0|thomas', email: 't.mueller@old-university.edu', civicrmId: '8', name: 'Thomas Müller' },
      { userId: 'auth0|henrik', email: 'henrik.n@gmail.com', civicrmId: null, name: 'Henrik Nielsen' },
      { userId: 'auth0|marco1', email: 'marco.rossi.a@old.com', civicrmId: null, name: 'Marco Rossi' },
      { userId: 'auth0|marco2', email: 'marco.rossi.b@old.com', civicrmId: '999', name: 'Marco Rossi' },
    ];
    const lower = q.toLowerCase();
    const candidates = all.filter(
      (c) =>
        c.email.toLowerCase().includes(lower) ||
        normalize(c.name).includes(normalize(lower))
    );
    return { kind: 'name-search', candidates };
  }

  // Email dev mock — trigger specific branches based on the input.
  const lower = q.toLowerCase();
  if (lower === 't.mueller.new@uni-heidelberg.de') {
    return {
      kind: 'email-lookup',
      match: {
        status: 'active-different-email',
        matchedVia: 'civicrm-id',
        matched: { userId: 'auth0|thomas', email: 't.mueller@old-university.edu', civicrmId: '8', name: 'Thomas Müller' },
      },
    };
  }
  if (lower === 's.laurent@sorbonne.fr') {
    return {
      kind: 'email-lookup',
      match: {
        status: 'active',
        matchedVia: 'primary-email',
        matched: { userId: 'auth0|sophie', email: 's.laurent@sorbonne.fr', civicrmId: '3', name: 'Sophie Laurent' },
      },
    };
  }
  if (lower === 'shared@itatti.it') {
    // Dev trigger for the duplicate-civicrm-contact case.
    return {
      kind: 'email-lookup',
      match: {
        status: 'needs-review',
        reason: 'duplicate-civicrm-contact',
        candidates: [],
      },
    };
  }
  return { kind: 'email-lookup', match: { status: 'no-account' } };
}

export const fellowsAdminRoutes = router;
