import type { FormDef, FormPdfKind, FormSectionDef } from '../types/forms.js';

import { COUNTRIES } from './countries.js';
import { TITLE_OPTIONS } from './form-options.js';

const FORM_DESCRIPTION =
  'I understand that the information I provide is being collected for the purposes described in, and will be used in accordance with, I Tatti’s Privacy Policy (available at http://itatti.harvard.edu/privacy-policy)';

const FELLOW_MEMORANDUM_PDF_KINDS: FormPdfKind[] = ['memorandum', 'grants-resources'];
const TERM_FELLOW_APPOINTMENT = 'Fellow (short Term)';
const TERM_FELLOW_FELLOWSHIP_TYPES = [
  'berenson_fellow',
  'wallace_fellow',
  'digital_humanities_fellow',
  'craig_hugh_smyth_fellow',
  'david_&_julie_tobey_fellow',
  'i_tatti_prado-joint-fellowship',
  'warburg-i-tatti-joint',
  'marlène_and_paolo_fresco_fellowship_in_african_studies',
] as const;
const DUMBARTON_OAKS_FELLOWSHIP_TYPES = ['i_tatti_dumbarton_oaks_joint_fellow'] as const;
const GRADUATE_FELLOWSHIP_TYPES = ['graduate_visiting_fellow'] as const;

const TERM_FELLOW_RESOURCES_HELP_TEXT = `Please describe all financial resources available to you during your fellowship semester.
You must also provide an official letter from your employer (University, Museum, or other institution) confirming that:
• You will be on sabbatical leave or leave of absence for the full duration of the fellowship semester.
• the financial terms of your leave are clearly specified (e.g. whether you will receive full or partial salary).
• If you continue to receive a salary, the letter must include the relevant administrative contact, as the base grant will be directed to your home institution.
• You will be fully released from all duties and entirely free from any professional obligations, whether paid or unpaid, for the entire fellowship semester.
Please note: Fellows may not hold any other fellowship or professional appointment concurrently.
If you are in receipt of additional grants:
• List them below
• Send a copy of each award letter by email attachment`;
const GRADUATE_RESOURCES_HELP_TEXT = `Please describe all financial resources available to you during your fellowship semester.
Please note: Graduate Fellowships may not be held concurrently with other major fellowship awards. Fellows may not undertake any professional obligations outside I Tatti during the fellowship semester, including part-time activities.
If you are in receipt of supplementary funding, including funds awarded by Harvard schools:
• List them below
• Send a copy of the relevant documentation by email attachment`;
const TERM_FELLOW_ADDITIONAL_INFO_HELP_TEXT =
  'Please indicate any special circumstances or difficulties that may arise as a result of your fellowship.';

const legacyPersonalSection: FormSectionDef = {
  title: 'Personal Information',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Dr, Prof, etc.' },
    { name: 'givenName', label: 'Given name', type: 'text', required: true },
    { name: 'surname', label: 'Surname/Family name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'legalAddress', label: 'Legal address', type: 'textarea', required: true },
    {
      name: 'countryMovingFrom',
      label: 'From which country will you be moving from to take up your fellowship at I Tatti',
      type: 'select',
      required: true,
      options: [...COUNTRIES],
    },
    {
      name: 'hasUsSsn',
      label: 'Do you have a US Social Security number',
      type: 'radio',
      required: true,
      options: ['Yes', 'No'],
    },
    {
      name: 'statusAtItatti',
      label: 'What will your status be while residing at I Tatti',
      type: 'radio',
      required: true,
      options: ['On sabbatical leave from university', 'Independent Scholar', 'Other'],
    },
    {
      name: 'statusOther',
      label: 'If "Other" please indicate',
      type: 'text',
      required: false,
      conditionalOn: { field: 'statusAtItatti', value: 'Other' },
    },
    { name: 'nationality', label: 'Nationality', type: 'text', required: true },
    { name: 'secondNationality', label: 'Second Nationality', type: 'text', required: false },
    {
      name: 'dateOfBirth',
      label: 'Date of birth',
      type: 'date',
      required: false,
      minDate: '1900-01-01',
      maxDate: 'today',
    },
  ],
};

const legacyFamilySection: FormSectionDef = {
  title: 'Family',
  description:
    'Members of your family who may be accompanying or visiting you during your fellowship:',
  fields: [
    { name: 'partnerName', label: 'Full name of partner', type: 'text', required: false },
    { name: 'partnerDatesOfStay', label: 'Dates of stay', type: 'text', required: false },
    {
      name: 'childrenNamesDob',
      label: 'Name and date of birth of children',
      type: 'text',
      required: false,
    },
    { name: 'childrenDatesOfStay', label: 'Dates of stay', type: 'text', required: false },
  ],
};

const legacyEmergencySection: FormSectionDef = {
  title: 'Emergency Contact',
  description: 'In case of an emergency please notify:',
  fields: [
    { name: 'emergencyName', label: 'Full name', type: 'text', required: true },
    {
      name: 'emergencyRelationship',
      label: 'Relationship to Nominee (i.e. parent, sister etc.)',
      type: 'text',
      required: false,
    },
    {
      name: 'emergencyPhone',
      label: 'Telephone (including country code)',
      type: 'text',
      required: true,
    },
    { name: 'emergencyEmail', label: 'Email', type: 'email', required: true },
  ],
};

const legacyGrantsSection: FormSectionDef = {
  title: 'Grants & Resources',
  description:
    'Grants can be paid directly to Fellows, or to the Fellow’s institution, or divided between the two. Base grant amounts are paid in two installments, half at the end of July and half the end of January. Amanda Smith in the Cambridge Office will contact you in the coming months regarding details required for the transfer of your grant payments.',
  fields: [
    {
      name: 'resources',
      label: 'Resources for the fellowship year (1 July – 30 June)',
      type: 'textarea',
      required: true,
      helpText:
        'Please describe your resources for the fellowship year in the space below. We require a letter from your employer (University, Museum, other) stating the conditions and financial terms of your leave. If you are receiving any other grants please list them below and send us by email attachment, a copy of the grant letter.',
    },
    {
      name: 'additionalInfo',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      helpText:
        'Please let us know about any particular difficulties or special circumstances that may arise as a result of your Fellowship.',
    },
  ],
};

const personalSection: FormSectionDef = {
  title: 'Personal Information',
  icon: 'user',
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'select',
      required: false,
      options: [...TITLE_OPTIONS],
      placeholder: 'Select title',
      layout: 'third',
      autoComplete: 'honorific-prefix',
    },
    {
      name: 'givenName',
      label: 'Given name',
      type: 'text',
      required: true,
      layout: 'third',
      autoComplete: 'given-name',
    },
    {
      name: 'surname',
      label: 'Surname / family name',
      type: 'text',
      required: true,
      layout: 'third',
      autoComplete: 'family-name',
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      layout: 'half',
      autoComplete: 'email',
    },
    {
      name: 'countryMovingFrom',
      label: 'Country you will be moving from',
      type: 'select',
      required: true,
      options: [...COUNTRIES],
      layout: 'half',
      autoComplete: 'section-moving-from country-name',
    },
    {
      name: 'hasUsSsn',
      label: 'Do you have a US Social Security number?',
      type: 'radio',
      required: true,
      options: ['Yes', 'No'],
      layout: 'half',
    },
    {
      name: 'statusAtItatti',
      label: 'What will your status be while residing at I Tatti?',
      type: 'radio',
      required: true,
      options: ['On sabbatical leave from university', 'Independent Scholar', 'Other'],
      layout: 'half',
    },
    {
      name: 'statusOther',
      label: 'If other, please indicate',
      type: 'text',
      required: false,
      layout: 'half',
      conditionalOn: { field: 'statusAtItatti', value: 'Other' },
    },
    { name: 'nationality', label: 'Nationality', type: 'text', required: true, layout: 'half' },
    {
      name: 'secondNationality',
      label: 'Second nationality',
      type: 'text',
      required: false,
      layout: 'half',
    },
    {
      name: 'dateOfBirth',
      label: 'Date of birth',
      type: 'date',
      required: false,
      layout: 'third',
      autoComplete: 'bday',
      minDate: '1900-01-01',
      maxDate: 'today',
    },
  ],
};

const personalSectionV3: FormSectionDef = {
  title: 'Personal Information',
  icon: 'user',
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'select',
      required: false,
      options: [...TITLE_OPTIONS],
      placeholder: 'Select title',
      layout: 'third',
      autoComplete: 'honorific-prefix',
    },
    {
      name: 'givenName',
      label: 'Given name',
      type: 'text',
      required: true,
      layout: 'third',
      autoComplete: 'given-name',
    },
    {
      name: 'surname',
      label: 'Surname / family name',
      type: 'text',
      required: true,
      layout: 'third',
      autoComplete: 'family-name',
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      layout: 'half',
      autoComplete: 'email',
    },
    {
      name: 'mobilePhone',
      label: 'Mobile phone',
      type: 'text',
      required: true,
      layout: 'half',
      placeholder: 'Include country code',
      autoComplete: 'tel',
    },
    {
      name: 'countryMovingFrom',
      label: 'Country you will be moving from',
      type: 'select',
      required: true,
      options: [...COUNTRIES],
      layout: 'half',
      autoComplete: 'section-moving-from country-name',
    },
    {
      name: 'hasUsSsn',
      label: 'Do you have a US Social Security number?',
      type: 'select',
      required: true,
      options: ['Yes', 'No'],
      placeholder: 'Select an answer',
      layout: 'half',
    },
    {
      name: 'statusAtItatti',
      label: 'What will your status be while residing at I Tatti?',
      type: 'select',
      required: true,
      options: ['On sabbatical leave from university', 'Independent Scholar', 'Other'],
      placeholder: 'Select status',
      layout: 'half',
    },
    {
      name: 'statusOther',
      label: 'If other, please indicate',
      type: 'text',
      required: false,
      layout: 'half',
      conditionalOn: { field: 'statusAtItatti', value: 'Other' },
    },
    { name: 'nationality', label: 'Nationality', type: 'text', required: true, layout: 'half' },
    {
      name: 'secondNationality',
      label: 'Second nationality',
      type: 'text',
      required: false,
      layout: 'half',
    },
    {
      name: 'dateOfBirth',
      label: 'Date of birth',
      type: 'date',
      required: false,
      layout: 'third',
      autoComplete: 'bday',
      minDate: '1900-01-01',
      maxDate: 'today',
    },
  ],
};

const legalAddressSection: FormSectionDef = {
  title: 'Legal Address',
  description: 'Use the address format you would normally provide for official correspondence.',
  icon: 'map-pin',
  fields: [
    {
      name: 'legalStreetAddress',
      label: 'Street address',
      type: 'text',
      required: true,
      layout: 'full',
      autoComplete: 'street-address',
    },
    {
      name: 'legalCity',
      label: 'City',
      type: 'text',
      required: true,
      layout: 'half',
      autoComplete: 'address-level2',
    },
    {
      name: 'legalPostalCode',
      label: 'Postal code',
      type: 'text',
      required: false,
      layout: 'half',
      autoComplete: 'postal-code',
    },
    {
      name: 'legalStateProvince',
      label: 'State / Province',
      type: 'text',
      required: false,
      layout: 'half',
      autoComplete: 'address-level1',
    },
    {
      name: 'legalCountry',
      label: 'Country',
      type: 'select',
      required: true,
      options: [...COUNTRIES],
      layout: 'half',
      autoComplete: 'section-legal country-name',
    },
  ],
};

const legalAddressSectionV3: FormSectionDef = {
  title: 'Legal Address',
  description: 'Use the address format you would normally provide for official correspondence.',
  icon: 'map-pin',
  fields: [
    {
      name: 'legalStreetAddress',
      label: 'Street address',
      type: 'text',
      required: true,
      layout: 'full',
      autoComplete: 'street-address',
    },
    {
      name: 'legalSupplementalAddress',
      label: 'Supplemental address',
      type: 'text',
      required: false,
      layout: 'full',
      placeholder: 'Apartment, building, c/o, department, or other address details',
      autoComplete: 'address-line2',
    },
    {
      name: 'legalCity',
      label: 'City',
      type: 'text',
      required: true,
      layout: 'half',
      autoComplete: 'address-level2',
    },
    {
      name: 'legalPostalCode',
      label: 'Postal code',
      type: 'text',
      required: false,
      layout: 'half',
      autoComplete: 'postal-code',
    },
    {
      name: 'legalStateProvince',
      label: 'State / Province',
      type: 'text',
      required: false,
      layout: 'half',
      autoComplete: 'address-level1',
    },
    {
      name: 'legalCountry',
      label: 'Country',
      type: 'select',
      required: true,
      options: [...COUNTRIES],
      layout: 'half',
      autoComplete: 'section-legal country-name',
    },
  ],
};

const familySection: FormSectionDef = {
  title: 'Family',
  description: 'Members of your family who may be accompanying or visiting you during your fellowship.',
  icon: 'users',
  fields: [
    { name: 'partnerName', label: 'Full name of partner', type: 'text', required: false, layout: 'half' },
    { name: 'partnerDatesOfStay', label: 'Dates of stay', type: 'text', required: false, layout: 'half' },
    {
      name: 'childrenNamesDob',
      label: 'Name and date of birth of children',
      type: 'text',
      required: false,
      layout: 'half',
    },
    { name: 'childrenDatesOfStay', label: 'Dates of stay', type: 'text', required: false, layout: 'half' },
  ],
};

const familySectionV3: FormSectionDef = {
  title: 'Family',
  description: 'Members of your family who may be accompanying or visiting you during your fellowship.',
  icon: 'users',
  fields: [
    {
      name: 'partnerSubheader',
      label: 'Partner',
      type: 'subheader',
      required: false,
      layout: 'full',
    },
    { name: 'partnerName', label: 'Full name of partner', type: 'text', required: false, layout: 'half' },
    { name: 'partnerDatesOfStay', label: 'Dates of stay', type: 'text', required: false, layout: 'half' },
    {
      name: 'childrenSubheader',
      label: 'Children',
      type: 'subheader',
      required: false,
      layout: 'full',
    },
    {
      name: 'children',
      label: 'Children',
      type: 'repeatable-group',
      required: false,
      layout: 'full',
      addLabel: 'Add child',
      itemLabel: 'Child',
      fields: [
        { name: 'fullName', label: 'Full name', type: 'text', required: true, layout: 'full' },
        {
          name: 'dateOfBirth',
          label: 'Date of birth',
          type: 'date',
          required: true,
          layout: 'third',
          minDate: '1900-01-01',
          maxDate: 'today',
        },
        { name: 'datesOfStay', label: 'Dates of stay', type: 'text', required: true, layout: 'two-thirds' },
      ],
    },
  ],
};

const emergencySection: FormSectionDef = {
  title: 'Emergency Contact',
  description: 'In case of an emergency please notify:',
  icon: 'life-buoy',
  fields: [
    {
      name: 'emergencyName',
      label: 'Full name',
      type: 'text',
      required: true,
      layout: 'half',
      autoComplete: 'section-emergency name',
    },
    {
      name: 'emergencyRelationship',
      label: 'Relationship to nominee',
      type: 'text',
      required: false,
      layout: 'half',
      placeholder: 'Parent, sister, spouse, colleague, etc.',
    },
    {
      name: 'emergencyPhone',
      label: 'Telephone',
      type: 'text',
      required: true,
      layout: 'half',
      placeholder: 'Include country code',
      autoComplete: 'section-emergency tel',
    },
    {
      name: 'emergencyEmail',
      label: 'Email',
      type: 'email',
      required: true,
      layout: 'half',
      autoComplete: 'section-emergency email',
    },
  ],
};

const grantsSection: FormSectionDef = {
  title: 'Grants & Resources',
  description:
    'Grants can be paid directly to Fellows, or to the Fellow’s institution, or divided between the two. Base grant amounts are paid in two installments, half at the end of July and half the end of January. Amanda Smith in the Cambridge Office will contact you in the coming months regarding details required for the transfer of your grant payments.',
  icon: 'landmark',
  fields: [
    {
      name: 'resources',
      label: 'Resources for the fellowship year (1 July – 30 June)',
      type: 'textarea',
      required: true,
      layout: 'full',
      helpText:
        'Please describe your resources for the fellowship year. We require a letter from your employer stating the conditions and financial terms of your leave. If you are receiving other grants, list them below and send us a copy of the grant letter by email attachment.',
    },
    {
      name: 'additionalInfo',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      layout: 'full',
      helpText:
        'Please let us know about any particular difficulties or special circumstances that may arise as a result of your Fellowship.',
    },
  ],
};

const grantsSectionV3: FormSectionDef = {
  title: 'Grant Information',
  description: `• The base grant is paid either directly to the Fellow or to the Fellow's home institution.
• Any additional funding (e.g. housing subsidy, travel) is paid directly to the Fellow
• Base grant payment is made in two installments:
  o Half at the end of July
  o Half at the end of January
• Any additional funding is also made in two installments:
  o Beginning of October
  o Beginning of February`,
  icon: 'landmark',
  fields: [
    {
      name: 'resources',
      label: 'Resources (1 July – 30 June)',
      type: 'textarea',
      required: true,
      layout: 'full',
      helpText: `Please describe all financial resources available to you during the fellowship year.
You must also provide an official letter from your employer (University, Museum, or other institution) confirming that:
• You will be on sabbatical leave or leave of absence for the full fellowship period (1 July–30 June).
• The financial terms of your leave are clearly specified (e.g. whether you will receive full or partial salary).
• If you continue to receive a salary, the letter must include the relevant administrative contact, as the base grant will be directed to your home institution.
• You will be fully released from all duties and entirely free from any professional obligations, whether paid or unpaid, for the entire fellowship period.
Please note: Fellows may not hold any other fellowship or professional appointment concurrently.
If you are receiving any additional grants:
• List them below
• Send a copy of each award letter by email attachment`,
    },
    {
      name: 'additionalInfo',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      layout: 'full',
      helpText:
        'Please indicate any special circumstances or difficulties that may arise as a result of your fellowship.',
    },
  ],
};

const standardTermGrantsSection: FormSectionDef = {
  title: 'Grant Information',
  description: `• The base grant is paid either directly to the Fellow or to the Fellow's home institution.
• Any additional funding (e.g. housing subsidy, travel) is paid directly to the Fellow.
• Base grant payments are disbursed as follows:
  o End of September (fall semester Fellows)
  o End of January (winter-spring semester Fellows)
• Any additional funding is disbursed as follows:
  o Beginning of October (fall semester Fellows)
  o Beginning of February (winter-spring semester Fellows)`,
  icon: 'landmark',
  fields: [
    {
      name: 'resources',
      label: 'Resources for the fellowship semester',
      type: 'textarea',
      required: true,
      layout: 'full',
      helpText: TERM_FELLOW_RESOURCES_HELP_TEXT,
    },
    {
      name: 'additionalInfo',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      layout: 'full',
      helpText: TERM_FELLOW_ADDITIONAL_INFO_HELP_TEXT,
    },
  ],
};

const dumbartonOaksGrantsSection: FormSectionDef = {
  title: 'Grant Information',
  description: `• The base grant is paid either directly to the Fellow or to the Fellow's home institution.
• Any additional funding (e.g. housing subsidy, travel) is paid directly to the Fellow.
• Base grant is disbursed at the end of July
• Any additional funding is disbursed at the beginning of October`,
  icon: 'landmark',
  fields: [
    {
      name: 'resources',
      label: 'Resources for the fellowship semester',
      type: 'textarea',
      required: true,
      layout: 'full',
      helpText: TERM_FELLOW_RESOURCES_HELP_TEXT,
    },
    {
      name: 'additionalInfo',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      layout: 'full',
      helpText: TERM_FELLOW_ADDITIONAL_INFO_HELP_TEXT,
    },
  ],
};

const graduateGrantsSection: FormSectionDef = {
  title: 'Grant Information',
  description: `Grants are paid directly to Fellows.
• Base grant payments are disbursed as follows:
  o End of September (fall semester Fellows)
  o End of January (winter-spring semester Fellows)
• Any additional funding is disbursed as follows:
  o Beginning of October (fall semester Fellows)
  o Beginning of February (winter-spring semester Fellows)`,
  icon: 'landmark',
  fields: [
    {
      name: 'resources',
      label: 'Resources for the fellowship semester',
      type: 'textarea',
      required: true,
      layout: 'full',
      helpText: GRADUATE_RESOURCES_HELP_TEXT,
    },
    {
      name: 'additionalInfo',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      layout: 'full',
      helpText: TERM_FELLOW_ADDITIONAL_INFO_HELP_TEXT,
    },
  ],
};

export const FORM_REGISTRY: FormDef[] = [
  {
    id: 'fellow-memorandum',
    title: 'Memorandum I Tatti Fellowship',
    description: FORM_DESCRIPTION,
    active: false,
    pdfKinds: [...FELLOW_MEMORANDUM_PDF_KINDS],
    appointmentTypes: ['Fellow'],
    sections: [
      legacyPersonalSection,
      legacyFamilySection,
      legacyEmergencySection,
      legacyGrantsSection,
    ],
  },
  {
    id: 'fellow-memorandum-v2',
    title: 'Memorandum I Tatti Fellowship',
    description: FORM_DESCRIPTION,
    active: false,
    pdfKinds: [...FELLOW_MEMORANDUM_PDF_KINDS],
    appointmentTypes: ['Fellow'],
    sections: [
      personalSection,
      legalAddressSection,
      familySection,
      emergencySection,
      grantsSection,
    ],
  },
  {
    id: 'fellow-memorandum-v3',
    title: 'Memorandum I Tatti Fellowship',
    description: FORM_DESCRIPTION,
    active: true,
    pdfKinds: [...FELLOW_MEMORANDUM_PDF_KINDS],
    appointmentTypes: ['Fellow'],
    sections: [
      personalSectionV3,
      legalAddressSectionV3,
      familySectionV3,
      emergencySection,
      grantsSectionV3,
    ],
  },
  {
    id: 'term-fellow-memorandum-v1',
    title: 'Memorandum I Tatti Term Fellowship',
    description: FORM_DESCRIPTION,
    active: true,
    pdfKinds: [...FELLOW_MEMORANDUM_PDF_KINDS],
    appointmentTypes: [TERM_FELLOW_APPOINTMENT],
    fellowshipTypes: [...TERM_FELLOW_FELLOWSHIP_TYPES],
    sections: [
      personalSectionV3,
      legalAddressSectionV3,
      familySectionV3,
      emergencySection,
      standardTermGrantsSection,
    ],
  },
  {
    id: 'dumbarton-oaks-fellow-memorandum-v1',
    title: 'Memorandum I Tatti Dumbarton Oaks Fellowship',
    description: FORM_DESCRIPTION,
    active: true,
    pdfKinds: [...FELLOW_MEMORANDUM_PDF_KINDS],
    appointmentTypes: [TERM_FELLOW_APPOINTMENT],
    fellowshipTypes: [...DUMBARTON_OAKS_FELLOWSHIP_TYPES],
    sections: [
      personalSectionV3,
      legalAddressSectionV3,
      familySectionV3,
      emergencySection,
      dumbartonOaksGrantsSection,
    ],
  },
  {
    id: 'graduate-fellow-memorandum-v1',
    title: 'Memorandum I Tatti Graduate Fellowship',
    description: FORM_DESCRIPTION,
    active: true,
    pdfKinds: [...FELLOW_MEMORANDUM_PDF_KINDS],
    appointmentTypes: [TERM_FELLOW_APPOINTMENT],
    fellowshipTypes: [...GRADUATE_FELLOWSHIP_TYPES],
    sections: [
      personalSectionV3,
      legalAddressSectionV3,
      familySectionV3,
      emergencySection,
      graduateGrantsSection,
    ],
  },
];

export function getFormDef(formId: string): FormDef | undefined {
  return FORM_REGISTRY.find((f) => f.id === formId);
}

export function isActiveFormDef(formDef: FormDef): boolean {
  return formDef.active !== false;
}

export function getActiveFormDefs(): FormDef[] {
  return FORM_REGISTRY.filter(isActiveFormDef);
}

function normalizeFormMatchValue(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[_\-()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAppointmentType(formDef: FormDef, appointmentType: string): boolean {
  const normalizedAppointment = normalizeFormMatchValue(appointmentType);
  return (
    normalizedAppointment.length > 0 &&
    formDef.appointmentTypes.some(
      (type) => normalizeFormMatchValue(type) === normalizedAppointment
    )
  );
}

function matchesFellowshipType(formDef: FormDef, fellowshipType?: string): boolean {
  if (!formDef.fellowshipTypes || formDef.fellowshipTypes.length === 0) return true;

  const normalizedFellowship = normalizeFormMatchValue(fellowshipType);
  return (
    normalizedFellowship.length > 0 &&
    formDef.fellowshipTypes.some(
      (type) => normalizeFormMatchValue(type) === normalizedFellowship
    )
  );
}

export function getFormsForAppointmentType(appointmentType: string): FormDef[] {
  return getActiveFormDefs().filter(
    (f) => !f.fellowshipTypes?.length && matchesAppointmentType(f, appointmentType)
  );
}

export function getFormsForFellowship(
  appointmentType: string,
  fellowshipType?: string
): FormDef[] {
  return getActiveFormDefs().filter(
    (f) => matchesAppointmentType(f, appointmentType) && matchesFellowshipType(f, fellowshipType)
  );
}

/**
 * Prefix the server emits as formTitle when a submitted invitation's
 * formType is no longer in FORM_REGISTRY (the form was retired between
 * submission and display). Shared between server (who builds it) and web
 * (who parses it) so a typo on one side can't silently break the
 * retired-form UI branch.
 */
export const RETIRED_FORM_TITLE_PREFIX = '(retired form: ';

export function buildRetiredFormTitle(formType: string): string {
  return `${RETIRED_FORM_TITLE_PREFIX}${formType})`;
}

export function isRetiredFormTitle(formTitle: string): boolean {
  return formTitle.startsWith(RETIRED_FORM_TITLE_PREFIX);
}
