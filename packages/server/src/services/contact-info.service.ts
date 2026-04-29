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
} from '@itatti/shared';

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

// --- Location type fallback (shared) ---

const LOCATION_TYPE_IDS = [1, 2, 3, 4, 5];

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

  for (const typeId of LOCATION_TYPE_IDS) {
    if (!usedTypes.has(typeId)) return typeId;
  }

  return LOCATION_TYPE_IDS[0];
}

// --- Address functions ---

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
    isPrimary: !!a.is_primary,
  }));
}

export async function createAddress(
  contactId: number,
  input: CreateAddressInput
): Promise<CiviCRMAddress> {
  const locationTypeId = await pickLocationTypeId('Address', contactId);

  const existingAddresses = await civiApiCall('Address', 'get', {
    select: ['id'],
    where: [['contact_id', '=', contactId]],
    limit: 1,
  });
  const isFirst = existingAddresses.values.length === 0;

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
      is_primary: isFirst,
    },
  });

  const created = res.values[0];
  return {
    id: Number(created.id),
    contactId,
    streetAddress: input.streetAddress,
    supplementalAddress1: input.supplementalAddress1,
    city: input.city,
    postalCode: input.postalCode,
    stateProvinceId: input.stateProvinceId,
    countryId: input.countryId,
    isPrimary: isFirst,
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

const PHONE_TYPE_PHONE = 1;
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
    where: [
      ['contact_id', '=', contactId],
      ['phone_type_id', 'IN', [PHONE_TYPE_PHONE, PHONE_TYPE_MOBILE]],
    ],
    orderBy: { is_primary: 'DESC' },
    limit: 0,
  });

  return res.values.map((p) => ({
    id: Number(p.id),
    contactId: Number(p.contact_id),
    phone: String(p.phone || ''),
    phoneTypeId: Number(p.phone_type_id),
    phoneType: Number(p.phone_type_id) === PHONE_TYPE_MOBILE ? 'Mobile' as const : 'Phone' as const,
    isPrimary: !!p.is_primary,
  }));
}

export async function createPhone(
  contactId: number,
  input: CreatePhoneInput
): Promise<CiviCRMPhone> {
  const locationTypeId = await pickLocationTypeId('Phone', contactId);

  const existingPhones = await civiApiCall('Phone', 'get', {
    select: ['id'],
    where: [
      ['contact_id', '=', contactId],
      ['phone_type_id', 'IN', [PHONE_TYPE_PHONE, PHONE_TYPE_MOBILE]],
    ],
    limit: 1,
  });
  const isFirst = existingPhones.values.length === 0;

  const res = await civiApiCall('Phone', 'create', {
    values: {
      contact_id: contactId,
      phone: input.phone,
      phone_type_id: input.phoneTypeId,
      location_type_id: locationTypeId,
      is_primary: isFirst,
    },
  });

  const created = res.values[0];
  return {
    id: Number(created.id),
    contactId,
    phone: input.phone,
    phoneTypeId: input.phoneTypeId,
    phoneType: input.phoneTypeId === PHONE_TYPE_MOBILE ? 'Mobile' : 'Phone',
    isPrimary: isFirst,
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
