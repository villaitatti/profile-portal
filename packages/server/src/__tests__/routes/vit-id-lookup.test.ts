import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../env.js', () => ({
  env: {
    AUTH0_FELLOWS_ROLE_ID: 'test-role',
  },
  isDevMode: false,
}));

vi.mock('../../services/civicrm.service.js', () => ({
  findContactIdByAnyEmail: vi.fn(),
  getContactById: vi.fn(),
  getEmailsForContacts: vi.fn(),
}));

vi.mock('../../services/auth0.service.js', () => ({
  listUsersByRole: vi.fn(),
}));

vi.mock('../../services/appointee-email.service.js', () => ({
  sendBioEmailManually: vi.fn(),
}));

vi.mock('../../services/fellows.service.js', () => ({
  getFellowsDashboard: vi.fn(),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { handleVitIdLookup } from '../../routes/fellows-admin.routes.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as auth0Service from '../../services/auth0.service.js';

const mockCivicrm = vi.mocked(civicrmService);
const mockAuth0 = vi.mocked(auth0Service);

// Minimal Express req/res fakes — just enough surface for our handler.
function makeReq(query: Record<string, string | undefined>) {
  return { query } as unknown as import('express').Request;
}

function makeRes() {
  const calls: { status?: number; json?: unknown } = {};
  const res = {
    status(code: number) {
      calls.status = code;
      return this;
    },
    json(payload: unknown) {
      calls.json = payload;
      return this;
    },
  } as unknown as import('express').Response;
  return { res, calls };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/admin/vit-id-lookup', () => {
  describe('validation', () => {
    it('400 when q is missing', async () => {
      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({}), res);

      expect(calls.status).toBe(400);
      expect(calls.json).toMatchObject({ error: 'invalid_request' });
    });

    it('400 when q is empty string', async () => {
      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: '' }), res);

      expect(calls.status).toBe(400);
    });
  });

  describe('email-lookup branch', () => {
    it('returns active with primary-email match when Auth0 has exact email', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|x', email: 'me@x.com', name: 'Me Me' },
      ]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'me@x.com' }), res);

      expect(calls.json).toEqual({
        kind: 'email-lookup',
        match: {
          status: 'active',
          matchedVia: 'primary-email',
          matched: {
            userId: 'auth0|x',
            email: 'me@x.com',
            civicrmId: null,
            name: 'Me Me',
          },
        },
      });
    });

    it('returns active-different-email via civicrm_id (returning fellow)', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|returning', email: 'old@x.com', civicrmId: '77', name: 'Returning' },
      ]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 77 });
      // Full ladder now fetches contact + emails to build a LadderFellow.
      mockCivicrm.getContactById.mockResolvedValue({
        id: 77,
        firstName: 'Returning',
        lastName: 'Fellow',
        email: 'new@x.com',
      });
      mockCivicrm.getEmailsForContacts.mockResolvedValue(
        new Map([[77, { primary: 'new@x.com', secondaries: [] }]])
      );

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'new@x.com' }), res);

      expect(calls.json).toEqual({
        kind: 'email-lookup',
        match: {
          status: 'active-different-email',
          matchedVia: 'civicrm-id',
          matched: {
            userId: 'auth0|returning',
            email: 'old@x.com',
            civicrmId: '77',
            name: 'Returning',
          },
        },
      });
    });

    it('returns no-account when nothing matches', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'unknown@x.com' }), res);

      expect(calls.json).toEqual({
        kind: 'email-lookup',
        match: { status: 'no-account' },
      });
    });

    it('returns needs-review duplicate-civicrm-contact when email maps to 2+ contacts', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({
        found: false,
        duplicate: true,
        contactIds: [10, 20],
      });

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'shared@x.com' }), res);

      expect(calls.json).toEqual({
        kind: 'email-lookup',
        match: {
          status: 'needs-review',
          reason: 'duplicate-civicrm-contact',
          candidates: [],
        },
      });
    });

    it('returns no-account when CiviCRM finds a contact but Auth0 has no matching user', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|other', email: 'other@x.com' },
      ]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 42 });
      mockCivicrm.getContactById.mockResolvedValue({
        id: 42,
        firstName: 'Unknown',
        lastName: 'Person',
        email: 'claimant@x.com',
      });
      mockCivicrm.getEmailsForContacts.mockResolvedValue(
        new Map([[42, { primary: 'claimant@x.com', secondaries: [] }]])
      );

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'claimant@x.com' }), res);

      expect(calls.json).toEqual({
        kind: 'email-lookup',
        match: { status: 'no-account' },
      });
    });

    it('returns active-different-email via secondary-email (full ladder in route)', async () => {
      // Regression test for the ship-review finding: the Has VIT ID endpoint
      // must use the full 4-tier ladder, not just tier 1 + tier 2.
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|isabella', email: 'old@y.com' },
      ]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 88 });
      mockCivicrm.getContactById.mockResolvedValue({
        id: 88,
        firstName: 'Isabella',
        lastName: 'Ferrari',
        email: 'new@x.com',
      });
      mockCivicrm.getEmailsForContacts.mockResolvedValue(
        new Map([[88, { primary: 'new@x.com', secondaries: ['old@y.com'] }]])
      );

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'new@x.com' }), res);

      expect(calls.json).toMatchObject({
        kind: 'email-lookup',
        match: {
          status: 'active-different-email',
          matchedVia: 'secondary-email',
        },
      });
    });
  });

  describe('name-search branch', () => {
    it('returns name-search with all Auth0 candidates matching the query substring', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|1', email: 'maria1@x.com', name: 'Maria Rossi' },
        { user_id: 'auth0|2', email: 'marco@x.com', name: 'Marco Verdi' },
        { user_id: 'auth0|3', email: 'other@x.com', name: 'Other Person' },
      ]);

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'mar' }), res);

      expect(calls.json).toEqual({
        kind: 'name-search',
        candidates: [
          { userId: 'auth0|1', email: 'maria1@x.com', civicrmId: null, name: 'Maria Rossi' },
          { userId: 'auth0|2', email: 'marco@x.com', civicrmId: null, name: 'Marco Verdi' },
        ],
      });
    });

    it('returns empty name-search candidates when nothing matches', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|1', email: 'x@y.com', name: 'X Y' },
      ]);

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'zzz' }), res);

      expect(calls.json).toEqual({ kind: 'name-search', candidates: [] });
    });
  });

  describe('error handling', () => {
    it('500 when Auth0 fetch fails', async () => {
      mockAuth0.listUsersByRole.mockRejectedValue(new Error('Auth0 down'));
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'x@y.com' }), res);

      expect(calls.status).toBe(500);
      expect(calls.json).toEqual({ error: 'internal_error' });
    });

    it('500 when CiviCRM fetch fails', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([]);
      mockCivicrm.findContactIdByAnyEmail.mockRejectedValue(new Error('CiviCRM down'));

      const { res, calls } = makeRes();
      await handleVitIdLookup(makeReq({ q: 'x@y.com' }), res);

      expect(calls.status).toBe(500);
    });
  });
});
