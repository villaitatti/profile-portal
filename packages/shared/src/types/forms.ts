export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'subheader'
  | 'repeatable-group';

export type FormFieldLayout = 'full' | 'half' | 'third' | 'two-thirds';

export type FormSectionIcon =
  | 'user'
  | 'map-pin'
  | 'users'
  | 'life-buoy'
  | 'landmark';

export type FormPdfKind = 'memorandum' | 'grants-resources';

export interface FormFieldDef {
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  maxLength?: number;
  minDate?: string;
  maxDate?: string | 'today';
  layout?: FormFieldLayout;
  autoComplete?: string;
  conditionalOn?: { field: string; value: string };
  fields?: FormFieldDef[];
  addLabel?: string;
  itemLabel?: string;
}

export interface FormSectionDef {
  title: string;
  description?: string;
  icon?: FormSectionIcon;
  fields: FormFieldDef[];
}

export interface FormDef {
  id: string;
  title: string;
  description?: string;
  active?: boolean;
  pdfKinds?: FormPdfKind[];
  appointmentTypes: string[];
  fellowshipTypes?: string[];
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

export type FormResponseScalar = string | boolean | null;

export interface FormResponseGroupItem {
  [fieldName: string]: FormResponseScalar;
}

export type FormResponseValue = FormResponseScalar | FormResponseGroupItem[];

export interface FormResponseData {
  [fieldName: string]: FormResponseValue;
}
