export interface HelpTicketInput {
  fullName: string;
  contactEmail: string;
  fellowshipYear: string;
  message?: string;
}

export interface HelpTicketResult {
  issueKey: string;
}
