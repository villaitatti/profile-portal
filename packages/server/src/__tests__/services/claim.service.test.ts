import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processClaim } from '../../services/claim.service.js';

// Mock the external services
vi.mock('../../services/auth0.service.js', () => ({
  findUserByEmail: vi.fn(),
  listUsersByRole: vi.fn(),
  createUser: vi.fn(),
  assignFellowsRole: vi.fn(),
  assignRole: vi.fn(),
  removeRole: vi.fn(),
  triggerPasswordSetupEmail: vi.fn(),
}));

vi.mock('../../services/civicrm.service.js', () => ({
  findContactByPrimaryEmail: vi.fn(),
  findContactIdByAnyEmail: vi.fn(),
  getContactById: vi.fn(),
  getEmailsForContacts: vi.fn(),
  getFellowships: vi.fn(),
}));

vi.mock('../../services/atlassian-jsm.service.js', () => ({
  isJsmConfigured: vi.fn().mockReturnValue(false),
  addUserToFormerAppointees: vi.fn().mockResolvedValue({ site1: true, site2: true }),
  addUserToCurrentAppointees: vi.fn().mockResolvedValue({ site1: true, site2: true }),
}));

vi.mock('../../services/email.service.js', () => ({
  sendClaimNotification: vi.fn().mockResolvedValue(undefined),
  sendClaimNeedsReconciliationNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    vitIdClaim: {
      create: vi.fn().mockResolvedValue({ id: 'test-claim-id' }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../env.js', () => ({
  env: {
    AUTH0_FELLOWS_ROLE_ID: 'test-fellows-role',
    AUTH0_FELLOWS_CURRENT_ROLE_ID: 'test-fellows-current-role',
    AUTH0_CONNECTION: 'Username-Password-Authentication',
  },
  isDevMode: false,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import mocked modules
import * as auth0Service from '../../services/auth0.service.js';
import * as civicrmService from '../../services/civicrm.service.js';

const mockAuth0 = vi.mocked(auth0Service);
const mockCivicrm = vi.mocked(civicrmService);

describe('processClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ladder defaults: no prior Auth0 accounts, no prior CiviCRM contact —
    // tests opt in to specific ladder states by overriding these.
    mockAuth0.listUsersByRole.mockResolvedValue([]);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: false });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(new Map());
  });

  it('sends password reset when user already exists in Auth0 (exact email)', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue({
      user_id: 'auth0|existing',
      email: 'existing@test.com',
    });

    await processClaim('existing@test.com');

    expect(mockAuth0.triggerPasswordSetupEmail).toHaveBeenCalledWith('existing@test.com');
    expect(mockAuth0.listUsersByRole).not.toHaveBeenCalled();
    expect(mockCivicrm.findContactIdByAnyEmail).not.toHaveBeenCalled();
  });

  it('returns silently when no CiviCRM contact found', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    // Default mocks cover this: listUsersByRole=[], findContactIdByAnyEmail=not found

    await processClaim('nobody@test.com');

    expect(mockAuth0.createUser).not.toHaveBeenCalled();
  });

  it('returns silently when contact is not eligible', async () => {
    // Ladder: CiviCRM has the contact but Auth0 has no matching user
    // (no prior claim), so reconcile() returns 'no-account' and we fall
    // through to the main flow, which then finds the contact is ineligible.
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 100 });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 100,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@test.com',
    });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[100, { primary: 'test@test.com', secondaries: [] }]])
    );
    mockCivicrm.getFellowships.mockResolvedValue([]);

    await processClaim('test@test.com');

    expect(mockAuth0.createUser).not.toHaveBeenCalled();
  });

  it('creates Auth0 user and sends email for eligible contact', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 100 });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 100,
      firstName: 'Fellow',
      lastName: 'User',
      email: 'fellow@test.com',
    });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[100, { primary: 'fellow@test.com', secondaries: [] }]])
    );
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 1,
        contactId: 100,
        startDate: '2024-07-01',
        endDate: '2025-06-30',
        fellowshipAccepted: true,
      },
    ]);
    mockAuth0.createUser.mockResolvedValue({
      user_id: 'auth0|new',
      email: 'fellow@test.com',
    });

    await processClaim('fellow@test.com');

    expect(mockAuth0.createUser).toHaveBeenCalledWith({
      email: 'fellow@test.com',
      firstName: 'Fellow',
      lastName: 'User',
      civicrmId: 100,
    });
    expect(mockAuth0.assignFellowsRole).toHaveBeenCalledWith('auth0|new');
    expect(mockAuth0.triggerPasswordSetupEmail).toHaveBeenCalledWith('fellow@test.com');
  });

  it('returning fellow via civicrm_id: sends password reset to OLD Auth0 email + IT notification, does not create new account', async () => {
    const emailModule = await import('../../services/email.service.js');
    const mockEmail = vi.mocked(emailModule);

    // Claimant types their new email. Auth0 has them under an old email,
    // linked via app_metadata.civicrm_id. The ladder should resolve this
    // before we hit account creation.
    mockAuth0.findUserByEmail.mockResolvedValue(null); // no exact email match
    mockAuth0.listUsersByRole.mockResolvedValue([
      {
        user_id: 'auth0|returning',
        email: 'old@x.com',
        name: 'Returning Fellow',
        civicrmId: '500',
      },
    ]);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 500 });
    // The full-ladder path needs the contact + email rows to build a LadderFellow.
    mockCivicrm.getContactById.mockResolvedValue({
      id: 500,
      firstName: 'Returning',
      lastName: 'Fellow',
      email: 'new@x.com',
    });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[500, { primary: 'new@x.com', secondaries: [] }]])
    );

    await processClaim('new@x.com');

    // Password reset to the OLD Auth0 email — the matched account's email,
    // not the claimant's typed email.
    expect(mockAuth0.triggerPasswordSetupEmail).toHaveBeenCalledWith('old@x.com');
    expect(mockAuth0.triggerPasswordSetupEmail).not.toHaveBeenCalledWith('new@x.com');
    expect(mockAuth0.createUser).not.toHaveBeenCalled();

    // IT notification fires so staff can intervene if the claimant no longer
    // controls the old mailbox.
    expect(mockEmail.sendClaimNeedsReconciliationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        claimantEmail: 'new@x.com',
        reason: 'returning-fellow-reset-sent',
        resetSentTo: 'old@x.com',
      })
    );
  });

  it('returning fellow via secondary-email tier: reset to old Auth0 email (full ladder in claim)', async () => {
    // Regression test for the ship-review finding: the claim flow must use
    // the full 4-tier ladder, not just tier 1 + tier 2. Here the match is via
    // tier 3 (secondary-email). The returning fellow's OLD email is on their
    // CiviCRM contact as a secondary; their Auth0 account is under that old
    // email with no civicrm_id metadata.
    const emailModule = await import('../../services/email.service.js');
    const mockEmail = vi.mocked(emailModule);

    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|secondary', email: 'old@y.com' /* no civicrm_id metadata */ },
    ]);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 600 });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 600,
      firstName: 'Secondary',
      lastName: 'Match',
      email: 'new@x.com',
    });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[600, { primary: 'new@x.com', secondaries: ['old@y.com'] }]])
    );

    await processClaim('new@x.com');

    // Ladder caught the secondary-email match → reset to old@y.com, no new account.
    expect(mockAuth0.triggerPasswordSetupEmail).toHaveBeenCalledWith('old@y.com');
    expect(mockAuth0.createUser).not.toHaveBeenCalled();
    expect(mockEmail.sendClaimNeedsReconciliationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        claimantEmail: 'new@x.com',
        reason: 'returning-fellow-reset-sent',
        resetSentTo: 'old@y.com',
      })
    );
  });

  it('needs-review ladder result: IT notification + audit row, no reset, no account', async () => {
    const emailModule = await import('../../services/email.service.js');
    const mockEmail = vi.mocked(emailModule);
    const prismaModule = await import('../../lib/prisma.js');
    const mockPrisma = vi.mocked(prismaModule.prisma);

    // Two Auth0 users share the same civicrm_id — auth0-collision.
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockAuth0.listUsersByRole.mockResolvedValue([
      { user_id: 'auth0|a', email: 'a@x.com', civicrmId: '700' },
      { user_id: 'auth0|b', email: 'b@x.com', civicrmId: '700' },
    ]);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 700 });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 700,
      firstName: 'Ambiguous',
      lastName: 'Match',
      email: 'claim@x.com',
    });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[700, { primary: 'claim@x.com', secondaries: [] }]])
    );

    await processClaim('claim@x.com');

    // No reset sent, no account created.
    expect(mockAuth0.triggerPasswordSetupEmail).not.toHaveBeenCalled();
    expect(mockAuth0.createUser).not.toHaveBeenCalled();
    // IT got notified with the reason.
    expect(mockEmail.sendClaimNeedsReconciliationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        claimantEmail: 'claim@x.com',
        reason: 'auth0-collision',
      })
    );
    // Audit row written.
    expect(mockPrisma.vitIdClaim.create).toHaveBeenCalled();
  });

  it('duplicate CiviCRM contact: sends IT reconciliation notification, does not create account', async () => {
    const emailModule = await import('../../services/email.service.js');
    const mockEmail = vi.mocked(emailModule);

    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockAuth0.listUsersByRole.mockResolvedValue([]);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({
      found: false,
      duplicate: true,
      contactIds: [111, 222],
    });

    await processClaim('shared@x.com');

    expect(mockEmail.sendClaimNeedsReconciliationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        claimantEmail: 'shared@x.com',
        reason: 'duplicate-civicrm-contact',
        civicrmContactIds: [111, 222],
      })
    );
    expect(mockAuth0.createUser).not.toHaveBeenCalled();
    expect(mockAuth0.triggerPasswordSetupEmail).not.toHaveBeenCalled();
  });

  it('assigns fellows-current role for current-year fellowship', async () => {
    // Use dates that cover "now" (the test runs during the current academic year)
    const now = new Date();
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const startDate = `${startYear}-07-01`;
    const endDate = `${startYear + 1}-06-30`;

    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactIdByAnyEmail.mockResolvedValue({ found: true, contactId: 200 });
    mockCivicrm.getContactById.mockResolvedValue({
      id: 200,
      firstName: 'Current',
      lastName: 'Fellow',
      email: 'current@test.com',
    });
    mockCivicrm.getEmailsForContacts.mockResolvedValue(
      new Map([[200, { primary: 'current@test.com', secondaries: [] }]])
    );
    mockCivicrm.getFellowships.mockResolvedValue([
      {
        id: 2,
        contactId: 200,
        startDate,
        endDate,
        fellowshipAccepted: true,
      },
    ]);
    mockAuth0.createUser.mockResolvedValue({
      user_id: 'auth0|current',
      email: 'current@test.com',
    });

    await processClaim('current@test.com');

    expect(mockAuth0.assignFellowsRole).toHaveBeenCalledWith('auth0|current');
    expect(mockAuth0.assignRole).toHaveBeenCalledWith('auth0|current', 'test-fellows-current-role');
  });
});
