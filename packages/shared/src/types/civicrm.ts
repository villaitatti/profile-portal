export interface CiviCRMContact {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  imageUrl?: string;
}

export interface CiviCRMFellowship {
  id: number;
  contactId: number;
  startDate: string;
  endDate: string;
  fellowshipAccepted?: boolean;
}

export type FellowshipTemporal = 'past' | 'current' | 'upcoming';

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

export type VitIdStatus =
  | 'active'
  | 'active-different-email'
  | 'needs-review'
  | 'no-account';

export type MatchedVia =
  | 'primary-email'
  | 'civicrm-id'
  | 'secondary-email'
  | 'name';

export type NeedsReviewReason =
  | 'name-collision'
  | 'tier-conflict'
  | 'primary-conflict'
  | 'duplicate-civicrm-contact'
  // Two (or more) Auth0 users share the same email OR the same
  // app_metadata.civicrm_id. This is an Auth0-side data bug, not a CiviCRM
  // one. The ladder refuses to guess which is the right person.
  | 'auth0-collision';

export interface Auth0Candidate {
  userId: string;
  email: string;
  civicrmId: string | null;
  name: string | null;
}

export type FellowMatch =
  | { status: 'active'; matchedVia: 'primary-email'; matched: Auth0Candidate }
  | {
      status: 'active-different-email';
      matchedVia: 'civicrm-id' | 'secondary-email' | 'name';
      matched: Auth0Candidate;
      matchedViaEmail?: string;
    }
  | { status: 'needs-review'; reason: NeedsReviewReason; candidates: Auth0Candidate[] }
  | { status: 'no-account' };

export type CivicrmIdStatus = 'ok' | 'missing' | 'n/a';

export type BioEmailStatus = 'none' | 'pending' | 'sent' | 'failed';

export interface BioEmailSummary {
  // UI pill state derived from the DB AppointeeEmailStatus:
  //   - "none"    → no event exists, or event is SKIPPED
  //   - "pending" → event is PENDING or SENDING (in-flight)
  //   - "sent"    → event is SENT
  //   - "failed"  → event is FAILED
  status: BioEmailStatus;
  sentAt: string | null;
  // Current or next academic year this appointee is eligible for (null if neither)
  targetAcademicYear: string | null;
  // True when admin should see a "Send bio email" button for this row.
  // The button is suppressed when:
  //   - no VIT ID (Auth0 user) exists
  //   - no current/accepted-upcoming target academic year
  //   - status is "sent"    (already delivered — use re-send flow separately)
  //   - status is "pending" (already queued/in-flight — avoid double-sends)
  // Allowed: status "none" or "failed" (retryable).
  canManuallySend: boolean;
}

export interface FellowDashboardEntry {
  civicrmId: number;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
  appointment?: string;
  fellowship?: string;
  fellowshipYear: string;
  status: VitIdStatus;
  matchedVia?: MatchedVia;
  matched?: Auth0Candidate;
  matchedViaEmail?: string;
  reason?: NeedsReviewReason;
  candidates?: Auth0Candidate[];
  civicrmIdStatus: CivicrmIdStatus;
  bioEmail: BioEmailSummary;
}

export interface FellowsDashboardResponse {
  fellows: FellowDashboardEntry[];
  academicYears: string[];
  summary: {
    total: number;
    noAccount: number;
    active: number;
    activeDifferentEmail: number;
    needsReview: number;
  };
}

/**
 * Response shape for GET /api/admin/vit-id-lookup.
 *
 * Unified search across Auth0 + CiviCRM. Takes a freeform query and returns
 * either a list of candidates (name-style search) or a single match verdict
 * (email-style search).
 */
export type VitIdLookupResponse =
  | {
      // Name-style search: returns multiple candidates (may be empty)
      kind: 'name-search';
      candidates: Auth0Candidate[];
    }
  | {
      // Email-style search: single match verdict via the match ladder
      kind: 'email-lookup';
      match: FellowMatch;
    };
