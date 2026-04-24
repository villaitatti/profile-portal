import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: mockWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  computeAppointeeStatus,
  type EmailEventStatus,
} from '../../services/appointee-status.js';
import type { VitIdStatus } from '@itatti/shared';

beforeEach(() => {
  mockWarn.mockReset();
});

// Short aliases to keep the table readable.
type Row = {
  label: string;
  accepted: boolean;
  tier: VitIdStatus;
  invitation: EmailEventStatus;
  bio: EmailEventStatus;
  expected: string;
};

const cases: Row[] = [
  // Nominated — fellowship not yet accepted
  { label: 'fellowship not accepted → nominated', accepted: false, tier: 'no-account', invitation: 'NONE', bio: 'NONE', expected: 'nominated' },
  { label: 'not accepted even if ladder has match → nominated', accepted: false, tier: 'active', invitation: 'NONE', bio: 'NONE', expected: 'nominated' },

  // Accepted — just flipped, nothing else happened
  { label: 'accepted, no account, no invitation → accepted', accepted: true, tier: 'no-account', invitation: 'NONE', bio: 'NONE', expected: 'accepted' },

  // FAILED invitation keeps Angela in "accepted" so she can retry
  { label: 'accepted, invitation FAILED → accepted (retry path)', accepted: true, tier: 'no-account', invitation: 'FAILED', bio: 'NONE', expected: 'accepted' },
  { label: 'accepted, invitation PENDING → accepted (not yet sent)', accepted: true, tier: 'no-account', invitation: 'PENDING', bio: 'NONE', expected: 'accepted' },

  // VIT ID Sent — invitation SENT, appointee has not claimed yet
  { label: 'invitation SENT, still no-account → vit-id-sent', accepted: true, tier: 'no-account', invitation: 'SENT', bio: 'NONE', expected: 'vit-id-sent' },

  // VIT ID Claimed — ladder found an Auth0 user, bio not yet sent
  { label: 'tier active, bio NONE → vit-id-claimed', accepted: true, tier: 'active', invitation: 'NONE', bio: 'NONE', expected: 'vit-id-claimed' },
  { label: 'tier active, invitation SENT, bio NONE → vit-id-claimed', accepted: true, tier: 'active', invitation: 'SENT', bio: 'NONE', expected: 'vit-id-claimed' },
  { label: 'tier active-different-email treated as hasVitId → vit-id-claimed', accepted: true, tier: 'active-different-email', invitation: 'NONE', bio: 'NONE', expected: 'vit-id-claimed' },
  { label: 'active-different-email + bio PENDING → vit-id-claimed', accepted: true, tier: 'active-different-email', invitation: 'NONE', bio: 'PENDING', expected: 'vit-id-claimed' },

  // Enrolled — terminal state, both gates cleared
  { label: 'tier active, bio SENT → enrolled', accepted: true, tier: 'active', invitation: 'NONE', bio: 'SENT', expected: 'enrolled' },
  { label: 'tier active-different-email, bio SENT → enrolled', accepted: true, tier: 'active-different-email', invitation: 'NONE', bio: 'SENT', expected: 'enrolled' },

  // needs-review rows get whatever the other signals imply (frontend disables Send)
  { label: 'accepted, tier needs-review → accepted', accepted: true, tier: 'needs-review', invitation: 'NONE', bio: 'NONE', expected: 'accepted' },
  { label: 'tier needs-review, invitation SENT → vit-id-sent', accepted: true, tier: 'needs-review', invitation: 'SENT', bio: 'NONE', expected: 'vit-id-sent' },

  // FAILED bio keeps row in vit-id-claimed (ladder still confirms VIT ID)
  { label: 'tier active, bio FAILED → vit-id-claimed (retryable)', accepted: true, tier: 'active', invitation: 'NONE', bio: 'FAILED', expected: 'vit-id-claimed' },

  // SKIPPED + PENDING bio do NOT count as sent for lifecycle
  { label: 'tier active, bio SKIPPED → vit-id-claimed', accepted: true, tier: 'active', invitation: 'NONE', bio: 'SKIPPED', expected: 'vit-id-claimed' },
];

describe('computeAppointeeStatus', () => {
  for (const c of cases) {
    it(c.label, () => {
      expect(
        computeAppointeeStatus({
          fellowshipAccepted: c.accepted,
          vitIdTier: c.tier,
          vitIdInvitationStatus: c.invitation,
          bioEmailStatus: c.bio,
        })
      ).toBe(c.expected);
    });
  }

  describe('returning-appointee shortcut', () => {
    it('Nominated → VIT ID Claimed in ONE transition when the appointee already has a VIT ID and fellowship flips accepted', () => {
      // Simulate the fellowship_accepted flip moment. The appointee already
      // had an Auth0 account (from a prior fellowship).
      const before = computeAppointeeStatus({
        fellowshipAccepted: false,
        vitIdTier: 'active',
        vitIdInvitationStatus: 'NONE',
        bioEmailStatus: 'NONE',
      });
      expect(before).toBe('nominated');

      const after = computeAppointeeStatus({
        fellowshipAccepted: true,
        vitIdTier: 'active',
        vitIdInvitationStatus: 'NONE',
        bioEmailStatus: 'NONE',
      });
      // Skips accepted + vit-id-sent entirely.
      expect(after).toBe('vit-id-claimed');
    });
  });

  describe('anomaly guard (bio SENT without active VIT ID)', () => {
    it('returns vit-id-sent and logs a warning when bio is SENT but tier is no-account', () => {
      const status = computeAppointeeStatus({
        fellowshipAccepted: true,
        vitIdTier: 'no-account',
        vitIdInvitationStatus: 'SENT',
        bioEmailStatus: 'SENT',
      });
      expect(status).toBe('vit-id-sent');
      expect(mockWarn).toHaveBeenCalledOnce();
      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'appointee_status_anomaly',
          vitIdTier: 'no-account',
          bioEmailStatus: 'SENT',
        }),
        expect.stringContaining('bio_email_sent_without_active_vit_id')
      );
    });

    it('does NOT warn in the happy enrolled path', () => {
      computeAppointeeStatus({
        fellowshipAccepted: true,
        vitIdTier: 'active',
        vitIdInvitationStatus: 'SENT',
        bioEmailStatus: 'SENT',
      });
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });
});
