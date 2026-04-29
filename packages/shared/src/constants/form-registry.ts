import type { FormDef } from '../types/forms.js';

import { COUNTRIES } from './countries.js';

export const FORM_REGISTRY: FormDef[] = [
  {
    id: 'fellow-memorandum',
    title: 'Memorandum I Tatti Fellowship',
    description:
      'I understand that the information I provide is being collected for the purposes described in, and will be used in accordance with, I Tatti’s Privacy Policy (available at http://itatti.harvard.edu/privacy-policy)',
    appointmentTypes: ['Fellow'],
    sections: [
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
      },
    ],
  },
];

export function getFormDef(formId: string): FormDef | undefined {
  return FORM_REGISTRY.find((f) => f.id === formId);
}

export function getFormsForAppointmentType(appointmentType: string): FormDef[] {
  return FORM_REGISTRY.filter((f) => f.appointmentTypes.includes(appointmentType));
}
