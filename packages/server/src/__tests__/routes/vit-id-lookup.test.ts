import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../env.js', () => ({
  env: {
    NODE_ENV: 'test',
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

import express from 'express';
import request from 'supertest';
import { handleVitIdLookup } from '../../routes/fellows-admin.routes.js';
import { errorHandler } from '../../middleware/error.js';
import * as civicrmService from '../../services/civicrm.service.js';
import * as auth0Service from '../../services/auth0.service.js';

const mockCivicrm = vi.mocked(civicrmService);
const mockAuth0 = vi.mocked(auth0Service);

// Mounted like production (routes/index.ts): the handler plus the real error
// middleware, so validation errors and unexpected failures are asserted
// against the canonical envelopes the client actually sees.
function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/admin/vit-id-lookup', handleVitIdLookup);
  app.use(errorHandler);
  return app;
}

function lookup(body: Record<string, unknown>) {
  return request(makeApp()).post('/api/admin/vit-id-lookup').send(body);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/admin/vit-id-lookup', () => {
  describe('validation', () => {
    it('400 VALIDATION_ERROR when q is missing', async () => {
      const res = await lookup({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 when q is empty string', async () => {
      const res = await lookup({ q: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('email-lookup branch', () => {
    it('returns active with primary-email match when Auth0 has exact email', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([
        { user_id: 'auth0|x', email: 'me@x.com', name: 'Me Me' },
      ]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });

      const res = await lookup({ q: 'me@x.com' });

      expect(res.body).toEqual({
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

      const res = await lookup({ q: 'new@x.com' });

      expect(res.body).toEqual({
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

      const res = await lookup({ q: 'unknown@x.com' });

      expect(res.body).toEqual({
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

      const res = await lookup({ q: 'shared@x.com' });

      expect(res.body).toEqual({
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

      const res = await lookup({ q: 'claimant@x.com' });

      expect(res.body).toEqual({
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

      const res = await lookup({ q: 'new@x.com' });

      expect(res.body).toMatchObject({
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

      const res = await lookup({ q: 'mar' });

      expect(res.body).toEqual({
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

      const res = await lookup({ q: 'zzz' });

      expect(res.body).toEqual({ kind: 'name-search', candidates: [] });
    });
  });

  describe('error handling', () => {
    it('500 with canonical envelope when Auth0 fetch fails', async () => {
      mockAuth0.listUsersByRole.mockRejectedValue(new Error('Auth0 down'));
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });

      const res = await lookup({ q: 'x@y.com' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    });

    it('500 when CiviCRM fetch fails', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([]);
      mockCivicrm.findContactIdByAnyEmail.mockRejectedValue(new Error('CiviCRM down'));

      const res = await lookup({ q: 'x@y.com' });

      expect(res.status).toBe(500);
    });
  });

  describe('PII safety', () => {
    it('sets Cache-Control: no-store on successful responses', async () => {
      mockAuth0.listUsersByRole.mockResolvedValue([]);
      mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });

      const res = await lookup({ q: 'x@y.com' });

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('error log does NOT include the raw email — only a shape descriptor', async () => {
      const loggerModule = await import('../../lib/logger.js');
      const mockError = vi.mocked(loggerModule.logger.error);

      mockAuth0.listUsersByRole.mockRejectedValue(new Error('boom'));

      await lookup({ q: 'sensitive@example.com' });

      expect(mockError).toHaveBeenCalled();
      const ctx = mockError.mock.calls[0][0] as Record<string, unknown>;
      expect(ctx).toHaveProperty('bodyShape');
      expect(ctx).not.toHaveProperty('query');
      // The raw email must NOT appear anywhere in the log context.
      expect(JSON.stringify(ctx)).not.toContain('sensitive@example.com');
      expect(ctx.bodyShape).toMatchObject({
        keys: ['q'],
        qPresent: true,
        qLength: 'sensitive@example.com'.length,
      });
    });
  });
});
