import { civiApiCall } from '../lib/civicrm-client.js';
import type {
  CiviCRMAddress,
  CiviCRMPhone,
  CreateAddressInput,
  UpdateAddressInput,
  CreatePhoneInput,
  UpdatePhoneInput,
  CountryOption,
  StateProvinceOption,
  LocationTypeLabel,
} from '@itatti/shared';
import { LOCATION_TYPE_MAIN_ID } from '@itatti/shared';

// --- Ownership verification (shared) ---

export async function verifyOwnership(
  entity: 'Address' | 'Phone',
  recordId: number,
  contactId: number
): Promise<boolean> {
  const res = await civiApiCall(entity, 'get', {
    select: ['id', 'contact_id'],
    where: [['id', '=', recordId]],
    limit: 1,
  });
  const record = res.values[0];
  if (!record) return false;
  return Number(record.contact_id) === contactId;
}

// --- Primary toggle (shared) ---

export async function setPrimary(
  entity: 'Address' | 'Phone',
  recordId: number
): Promise<void> {
  await civiApiCall(entity, 'update', {
    where: [['id', '=', recordId]],
    values: { is_primary: true },
  });
}

export interface SetPreferredAddressResult {
  oldPrimaryId: number | null;
  oldPrimaryLocationType: LocationTypeLabel | null;
}

export async function setPreferredAddress(
  contactId: number,
  newPrimaryId: number
): Promise<SetPreferredAddressResult> {
  const before = await civiApiCall('Address', 'get', {
    select: ['id', 'is_primary', 'location_type_id'],
    where: [['contact_id', '=', contactId]],
    limit: 0,
  });

  const oldPrimary = before.values.find((a) => !!a.is_primary && Number(a.id) !== newPrimaryId);
  const oldPrimaryId = oldPrimary ? Number(oldPrimary.id) : null;
  const oldPrimaryLocationType = oldPrimary
    ? (LOCATION_TYPE_LABELS[Number(oldPrimary.location_type_id)] || 'Other')
    : null;

  await civiApiCall('Address', 'update', {
    where: [['id', '=', newPrimaryId]],
    values: { is_primary: true, location_type_id: LOCATION_TYPE_MAIN_ID },
  });

  // Verify no duplicate primaries
  const after = await civiApiCall('Address', 'get', {
    select: ['id', 'is_primary'],
    where: [['contact_id', '=', contactId]],
    limit: 0,
  });
  const primaries = after.values.filter((a) => !!a.is_primary);
  if (primaries.length > 1) {
    for (const p of primaries) {
      if (Number(p.id) !== newPrimaryId) {
        await civiApiCall('Address', 'update', {
          where: [['id', '=', Number(p.id)]],
          values: { is_primary: false },
        });
      }
    }
  }

  return { oldPrimaryId, oldPrimaryLocationType };
}

export async function reclassifyAddress(
  recordId: number,
  locationTypeId: number
): Promise<void> {
  await civiApiCall('Address', 'update', {
    where: [['id', '=', recordId]],
    values: { location_type_id: locationTypeId },
  });
}

// --- Location type fallback (shared) ---

const LOCATION_TYPE_IDS_PHONE = [3, 1, 2, 4, 5];

async function pickLocationTypeId(
  entity: 'Address' | 'Phone',
  contactId: number
): Promise<number> {
  const existing = await civiApiCall(entity, 'get', {
    select: ['id', 'location_type_id'],
    where: [['contact_id', '=', contactId]],
    limit: 0,
  });

  const usedTypes = new Set(existing.values.map((r) => Number(r.location_type_id)));

  for (const typeId of LOCATION_TYPE_IDS_PHONE) {
    if (!usedTypes.has(typeId)) return typeId;
  }

  // All 5 standard types used — use Main as fallback (CiviCRM allows multiple if location differs)
  return LOCATION_TYPE_MAIN_ID;
}

// --- Primary reconciliation (race-safe) ---

async function reconcilePrimary(
  entity: 'Address' | 'Phone',
  contactId: number,
  newId: number
): Promise<boolean> {
  const existing = await civiApiCall(entity, 'get', {
    select: ['id', 'is_primary'],
    where: [['contact_id', '=', contactId]],
    limit: 0,
  });

  const hasPrimary = existing.values.some((r) => !!r.is_primary);
  if (hasPrimary) return false;

  await civiApiCall(entity, 'update', {
    where: [['id', '=', newId]],
    values: { is_primary: true },
  });
  return true;
}

// --- Address functions ---

const LOCATION_TYPE_LABELS: Record<number, LocationTypeLabel> = {
  1: 'Home',
  2: 'Work',
  3: 'Main',
  4: 'Temporary',
  5: 'Other',
};

export async function getAddresses(contactId: number): Promise<CiviCRMAddress[]> {
  const res = await civiApiCall('Address', 'get', {
    select: [
      'id',
      'contact_id',
      'street_address',
      'supplemental_address_1',
      'city',
      'postal_code',
      'state_province_id',
      'state_province_id:label',
      'country_id',
      'country_id:label',
      'location_type_id',
      'is_primary',
    ],
    where: [['contact_id', '=', contactId]],
    orderBy: { is_primary: 'DESC' },
    limit: 0,
  });

  return res.values.map((a) => ({
    id: Number(a.id),
    contactId: Number(a.contact_id),
    streetAddress: String(a.street_address || ''),
    supplementalAddress1: a.supplemental_address_1 ? String(a.supplemental_address_1) : undefined,
    city: String(a.city || ''),
    postalCode: a.postal_code ? String(a.postal_code) : undefined,
    stateProvinceId: a.state_province_id ? Number(a.state_province_id) : undefined,
    stateProvince: a['state_province_id:label'] ? String(a['state_province_id:label']) : undefined,
    countryId: Number(a.country_id || 0),
    country: a['country_id:label'] ? String(a['country_id:label']) : undefined,
    locationTypeId: Number(a.location_type_id || 1),
    locationType: LOCATION_TYPE_LABELS[Number(a.location_type_id)] || 'Other',
    isPrimary: !!a.is_primary,
  }));
}

export async function createAddress(
  contactId: number,
  input: CreateAddressInput
): Promise<CiviCRMAddress> {
  const locationTypeId = input.locationTypeId || await pickLocationTypeId('Address', contactId);

  const res = await civiApiCall('Address', 'create', {
    values: {
      contact_id: contactId,
      street_address: input.streetAddress,
      supplemental_address_1: input.supplementalAddress1 || null,
      city: input.city,
      postal_code: input.postalCode || null,
      state_province_id: input.stateProvinceId || null,
      country_id: input.countryId,
      location_type_id: locationTypeId,
      is_primary: false,
    },
  });

  const created = res.values[0];
  const newId = Number(created.id);

  const isPrimary = await reconcilePrimary('Address', contactId, newId);

  return {
    id: newId,
    contactId,
    streetAddress: input.streetAddress,
    supplementalAddress1: input.supplementalAddress1,
    city: input.city,
    postalCode: input.postalCode,
    stateProvinceId: input.stateProvinceId,
    countryId: input.countryId,
    locationTypeId,
    locationType: LOCATION_TYPE_LABELS[locationTypeId] || 'Other',
    isPrimary,
  };
}

export async function updateAddress(
  recordId: number,
  input: UpdateAddressInput
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (input.streetAddress !== undefined) values.street_address = input.streetAddress;
  if (input.supplementalAddress1 !== undefined) values.supplemental_address_1 = input.supplementalAddress1 || null;
  if (input.city !== undefined) values.city = input.city;
  if (input.postalCode !== undefined) values.postal_code = input.postalCode || null;
  if (input.stateProvinceId !== undefined) values.state_province_id = input.stateProvinceId || null;
  if (input.countryId !== undefined) values.country_id = input.countryId;

  await civiApiCall('Address', 'update', {
    where: [['id', '=', recordId]],
    values,
  });
}

export async function deleteAddress(recordId: number): Promise<void> {
  await civiApiCall('Address', 'delete', {
    where: [['id', '=', recordId]],
  });
}

export async function isAddressPrimary(recordId: number): Promise<boolean> {
  const res = await civiApiCall('Address', 'get', {
    select: ['id', 'is_primary'],
    where: [['id', '=', recordId]],
    limit: 1,
  });
  return !!res.values[0]?.is_primary;
}

// --- Phone functions ---

const PHONE_TYPE_MOBILE = 2;

export async function getPhones(contactId: number): Promise<CiviCRMPhone[]> {
  const res = await civiApiCall('Phone', 'get', {
    select: [
      'id',
      'contact_id',
      'phone',
      'phone_type_id',
      'phone_type_id:label',
      'is_primary',
    ],
    where: [['contact_id', '=', contactId]],
    orderBy: { is_primary: 'DESC' },
    limit: 0,
  });

  return res.values.map((p) => ({
    id: Number(p.id),
    contactId: Number(p.contact_id),
    phone: String(p.phone || ''),
    phoneTypeId: Number(p.phone_type_id),
    phoneType: String(p['phone_type_id:label'] || 'Phone') as 'Phone' | 'Mobile',
    isPrimary: !!p.is_primary,
  }));
}

export async function createPhone(
  contactId: number,
  input: CreatePhoneInput
): Promise<CiviCRMPhone> {
  const locationTypeId = await pickLocationTypeId('Phone', contactId);

  const res = await civiApiCall('Phone', 'create', {
    values: {
      contact_id: contactId,
      phone: input.phone,
      phone_type_id: input.phoneTypeId,
      location_type_id: locationTypeId,
      is_primary: false,
    },
  });

  const created = res.values[0];
  const newId = Number(created.id);

  const isPrimary = await reconcilePrimary('Phone', contactId, newId);

  return {
    id: newId,
    contactId,
    phone: input.phone,
    phoneTypeId: input.phoneTypeId,
    phoneType: input.phoneTypeId === PHONE_TYPE_MOBILE ? 'Mobile' : 'Phone',
    isPrimary,
  };
}

export async function updatePhone(
  recordId: number,
  input: UpdatePhoneInput
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (input.phone !== undefined) values.phone = input.phone;
  if (input.phoneTypeId !== undefined) values.phone_type_id = input.phoneTypeId;

  await civiApiCall('Phone', 'update', {
    where: [['id', '=', recordId]],
    values,
  });
}

export async function deletePhone(recordId: number): Promise<void> {
  await civiApiCall('Phone', 'delete', {
    where: [['id', '=', recordId]],
  });
}

export async function isPhonePrimary(recordId: number): Promise<boolean> {
  const res = await civiApiCall('Phone', 'get', {
    select: ['id', 'is_primary'],
    where: [['id', '=', recordId]],
    limit: 1,
  });
  return !!res.values[0]?.is_primary;
}

// --- Reference data ---

export async function getCountries(): Promise<CountryOption[]> {
  const res = await civiApiCall('Country', 'get', {
    select: ['id', 'name'],
    where: [['is_active', '=', true]],
    orderBy: { name: 'ASC' },
    limit: 0,
  });

  return res.values.map((c) => ({
    id: Number(c.id),
    name: String(c.name),
  }));
}

export async function getStateProvinces(countryId?: number): Promise<StateProvinceOption[]> {
  const where: unknown[] = [['is_active', '=', true]];
  if (countryId) {
    where.push(['country_id', '=', countryId]);
  }

  const res = await civiApiCall('StateProvince', 'get', {
    select: ['id', 'name', 'country_id'],
    where,
    orderBy: { name: 'ASC' },
    limit: 0,
  });

  return res.values.map((s) => ({
    id: Number(s.id),
    name: String(s.name),
    countryId: Number(s.country_id),
  }));
}
