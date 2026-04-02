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
