// The four location types a user can pick for an address. Main (id 3) is
// deliberately NOT here: it is reserved for the primary address and assigned
// by the server, never user-selected.
export const LOCATION_TYPES = [
  { id: 1, label: 'Home' },
  { id: 2, label: 'Work' },
  { id: 4, label: 'Other' },
  { id: 6, label: 'Temporary' },
] as const;

export const LOCATION_TYPE_MAIN_ID = 3;

/** CiviCRM location-type ids a user may select (everything except Main). */
export const SELECTABLE_LOCATION_TYPE_IDS: readonly number[] = LOCATION_TYPES.map((t) => t.id);

export type LocationTypeLabel = 'Home' | 'Work' | 'Main' | 'Temporary' | 'Other';

// Display labels for ALL known location types, including Main — used to label
// existing records, not to constrain what a user can pick (that's
// SELECTABLE_LOCATION_TYPE_IDS). Single source of truth; the server previously
// kept a divergent local copy of this table.
export const LOCATION_TYPE_LABELS: Record<number, LocationTypeLabel> = {
  ...Object.fromEntries(LOCATION_TYPES.map((t) => [t.id, t.label])),
  [LOCATION_TYPE_MAIN_ID]: 'Main',
};

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

export type UpdateAddressInput = Partial<CreateAddressInput>;

export interface CreatePhoneInput {
  phone: string;
  phoneTypeId: number;
}

export type UpdatePhoneInput = Partial<CreatePhoneInput>;

export interface CountryOption {
  id: number;
  name: string;
}

export interface StateProvinceOption {
  id: number;
  name: string;
  countryId: number;
}
