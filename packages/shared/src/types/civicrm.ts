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
  // UI pill state: gray "—" / yellow "Pending" / green "Sent" / red "Failed"
  status: BioEmailStatus;
  sentAt: string | null;
  // Current or next academic year this appointee is eligible for (empty if neither)
  targetAcademicYear: string | null;
  // True when admin should see a "Send bio email" button for this row:
  //   - VIT ID exists
  //   - current or next-year fellowship with fellowshipAccepted=true
  //   - no SENT event for that (contactId, academicYear) pair
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
