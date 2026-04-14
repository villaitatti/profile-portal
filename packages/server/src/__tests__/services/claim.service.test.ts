import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processClaim } from '../../services/claim.service.js';

// Mock the external services
vi.mock('../../services/auth0.service.js', () => ({
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  assignFellowsRole: vi.fn(),
  assignRole: vi.fn(),
  removeRole: vi.fn(),
  triggerPasswordSetupEmail: vi.fn(),
}));

vi.mock('../../services/civicrm.service.js', () => ({
  findContactByPrimaryEmail: vi.fn(),
  getFellowships: vi.fn(),
}));

vi.mock('../../services/atlassian-jsm.service.js', () => ({
  isJsmConfigured: vi.fn().mockReturnValue(false),
  addUserToFormerAppointees: vi.fn().mockResolvedValue({ site1: true, site2: true }),
  addUserToCurrentAppointees: vi.fn().mockResolvedValue({ site1: true, site2: true }),
}));

vi.mock('../../services/email.service.js', () => ({
  sendClaimNotification: vi.fn().mockResolvedValue(undefined),
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
  });

  it('sends password reset when user already exists in Auth0', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue({
      user_id: 'auth0|existing',
      email: 'existing@test.com',
    });

    await processClaim('existing@test.com');

    expect(mockAuth0.triggerPasswordSetupEmail).toHaveBeenCalledWith('existing@test.com');
    expect(mockCivicrm.findContactByPrimaryEmail).not.toHaveBeenCalled();
  });

  it('returns silently when no CiviCRM contact found', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactByPrimaryEmail.mockResolvedValue(null);

    await processClaim('nobody@test.com');

    expect(mockAuth0.createUser).not.toHaveBeenCalled();
  });

  it('returns silently when contact is not eligible', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactByPrimaryEmail.mockResolvedValue({
      id: 100,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@test.com',
    });
    mockCivicrm.getFellowships.mockResolvedValue([]);

    await processClaim('test@test.com');

    expect(mockAuth0.createUser).not.toHaveBeenCalled();
  });

  it('creates Auth0 user and sends email for eligible contact', async () => {
    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactByPrimaryEmail.mockResolvedValue({
      id: 100,
      firstName: 'Fellow',
      lastName: 'User',
      email: 'fellow@test.com',
    });
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

  it('assigns fellows-current role for current-year fellowship', async () => {
    // Use dates that cover "now" (the test runs during the current academic year)
    const now = new Date();
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const startDate = `${startYear}-07-01`;
    const endDate = `${startYear + 1}-06-30`;

    mockAuth0.findUserByEmail.mockResolvedValue(null);
    mockCivicrm.findContactByPrimaryEmail.mockResolvedValue({
      id: 200,
      firstName: 'Current',
      lastName: 'Fellow',
      email: 'current@test.com',
    });
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
