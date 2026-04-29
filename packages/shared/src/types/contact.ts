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
