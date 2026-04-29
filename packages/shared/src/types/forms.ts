export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox';

export interface FormFieldDef {
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  maxLength?: number;
  conditionalOn?: { field: string; value: string };
}

export interface FormSectionDef {
  title: string;
  description?: string;
  fields: FormFieldDef[];
}

export interface FormDef {
  id: string;
  title: string;
  description?: string;
  appointmentTypes: string[];
  sections: FormSectionDef[];
}

export type FormInvitationStatus = 'pending' | 'submitted' | 'expired';

export interface FormInvitationSummary {
  id: string;
  token: string;
  formType: string;
  formTitle: string;
  status: FormInvitationStatus;
  nominationSentAt: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface FormResponseData {
  [fieldName: string]: string | boolean | null;
}
