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

export type FellowStatus = 'no-account' | 'active';
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
  status: FellowStatus;
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
  };
}
