export interface CiviCRMContact {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
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

export interface FellowDashboardEntry {
  civicrmId: number;
  firstName: string;
  lastName: string;
  email: string;
  fellowshipYear: string;
  status: FellowStatus;
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
