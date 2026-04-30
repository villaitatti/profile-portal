export const LOCATION_TYPES = [
  { id: 1, label: 'Home' },
  { id: 2, label: 'Work' },
  { id: 4, label: 'Temporary' },
  { id: 5, label: 'Other' },
] as const;

export const LOCATION_TYPE_MAIN_ID = 3;

export type LocationTypeLabel = 'Home' | 'Work' | 'Main' | 'Temporary' | 'Other';

export interface CiviCRMAddress {
  id: number;
  contactId: number;
  streetAddress: string;
  supplementalAddress1?: string;
  city: string;
  postalCode?: string;
  stateProvinceId?: number;
  stateProvince?: string;
  countryId: number;
  country?: string;
  locationTypeId: number;
  locationType: LocationTypeLabel;
  isPrimary: boolean;
}

export interface CiviCRMPhone {
  id: number;
  contactId: number;
  phone: string;
  phoneTypeId: number;
  phoneType: 'Phone' | 'Mobile';
  isPrimary: boolean;
}

export interface CreateAddressInput {
  streetAddress: string;
  supplementalAddress1?: string;
  city: string;
  postalCode?: string;
  stateProvinceId?: number;
  countryId: number;
  locationTypeId?: number;
}

export interface UpdateAddressInput extends Partial<CreateAddressInput> {}

export interface CreatePhoneInput {
  phone: string;
  phoneTypeId: number;
}

export interface UpdatePhoneInput extends Partial<CreatePhoneInput> {}

export interface CountryOption {
  id: number;
  name: string;
}

export interface StateProvinceOption {
  id: number;
  name: string;
  countryId: number;
}
