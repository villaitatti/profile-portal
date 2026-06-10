import type { FormDef, FormSectionDef } from '../types/forms.js';

import { COUNTRIES } from './countries.js';
import { TITLE_OPTIONS } from './form-options.js';

const FORM_DESCRIPTION =
  'I understand that the information I provide is being collected for the purposes described in, and will be used in accordance with, I Tatti’s Privacy Policy (available at http://itatti.harvard.edu/privacy-policy)';

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
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: false },
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
      layout: 'full',
    },
    {
      name: 'statusAtItatti',
      label: 'What will your status be while residing at I Tatti?',
      type: 'select',
      required: true,
      options: ['On sabbatical leave from university', 'Independent Scholar', 'Other'],
      placeholder: 'Select status',
      layout: 'full',
    },
    {
      name: 'statusOther',
      label: 'If other, please indicate',
      type: 'text',
      required: false,
      layout: 'full',
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
        { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true, layout: 'third' },
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

export const FORM_REGISTRY: FormDef[] = [
  {
    id: 'fellow-memorandum',
    title: 'Memorandum I Tatti Fellowship',
    description: FORM_DESCRIPTION,
    active: false,
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
    appointmentTypes: ['Fellow'],
    sections: [
      personalSectionV3,
      legalAddressSectionV3,
      familySectionV3,
      emergencySection,
      grantsSection,
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

export function getFormsForAppointmentType(appointmentType: string): FormDef[] {
  return getActiveFormDefs().filter((f) => f.appointmentTypes.includes(appointmentType));
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
