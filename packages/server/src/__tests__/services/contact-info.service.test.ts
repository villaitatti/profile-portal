import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../env.js', () => ({
  env: {
    CIVICRM_BASE_URL: 'https://civi.test',
    CIVICRM_API_KEY: 'test-key',
    CIVICRM_SITE_KEY: 'test-site-key',
  },
  isDevMode: false,
}));

const mockFetch = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

import {
  verifyOwnership,
  setPrimary,
  getAddresses,
  createAddress,
  getPhones,
  createPhone,
  isAddressPrimary,
  isPhonePrimary,
} from '../../services/contact-info.service.js';

describe('verifyOwnership', () => {
  it('returns true when record belongs to the given contactId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1, contact_id: 42 }] }));
    expect(await verifyOwnership('Address', 1, 42)).toBe(true);
  });

  it('returns false when record belongs to a different contactId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1, contact_id: 99 }] }));
    expect(await verifyOwnership('Address', 1, 42)).toBe(false);
  });

  it('returns false when record does not exist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));
    expect(await verifyOwnership('Phone', 999, 42)).toBe(false);
  });
});

describe('setPrimary', () => {
  it('calls CiviCRM update with is_primary: true', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1 }] }));
    await setPrimary('Address', 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = mockFetch.mock.calls[0][1].body as string;
    const params = JSON.parse(decodeURIComponent(body.replace('params=', '')));
    expect(params.values.is_primary).toBe(true);
  });
});

describe('getAddresses', () => {
  it('maps CiviCRM response to camelCase interface', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      values: [{
        id: 1, contact_id: 42, street_address: '123 Main', supplemental_address_1: 'Apt 4',
        city: 'Florence', postal_code: '50135', state_province_id: 10,
        'state_province_id:label': 'Toscana', country_id: 1107, 'country_id:label': 'Italy', is_primary: true,
      }],
    }));

    const result = await getAddresses(42);
    expect(result).toEqual([{
      id: 1, contactId: 42, streetAddress: '123 Main', supplementalAddress1: 'Apt 4',
      city: 'Florence', postalCode: '50135', stateProvinceId: 10,
      stateProvince: 'Toscana', countryId: 1107, country: 'Italy', isPrimary: true,
    }]);
  });

  it('returns empty array when contact has no addresses', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));
    const result = await getAddresses(42);
    expect(result).toEqual([]);
  });
});

describe('createAddress', () => {
  it('sets isPrimary=true when contact has no existing primary', async () => {
    // pickLocationTypeId
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));
    // create call
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 10 }] }));
    // reconcilePrimary: fetch all addresses for contact (none have is_primary)
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 10, is_primary: false }] }));
    // reconcilePrimary: update new address to primary
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 10 }] }));

    const result = await createAddress(42, { streetAddress: '1 St', city: 'Rome', countryId: 1107 });
    expect(result.isPrimary).toBe(true);
  });

  it('sets isPrimary=false when contact already has a primary', async () => {
    // pickLocationTypeId
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));
    // create call
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 11 }] }));
    // reconcilePrimary: fetch all addresses (existing one is primary)
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1, is_primary: true }, { id: 11, is_primary: false }] }));

    const result = await createAddress(42, { streetAddress: '2 Ave', city: 'Florence', countryId: 1107 });
    expect(result.isPrimary).toBe(false);
  });
});

describe('getPhones', () => {
  it('maps phone types correctly', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      values: [
        { id: 1, contact_id: 42, phone: '+39 055 603251', phone_type_id: 1, 'phone_type_id:label': 'Phone', is_primary: true },
        { id: 2, contact_id: 42, phone: '+1 617 555 0123', phone_type_id: 2, 'phone_type_id:label': 'Mobile', is_primary: false },
      ],
    }));

    const result = await getPhones(42);
    expect(result[0].phoneType).toBe('Phone');
    expect(result[1].phoneType).toBe('Mobile');
  });
});

describe('createPhone', () => {
  it('sets isPrimary=true when contact has no existing primary phone', async () => {
    // pickLocationTypeId
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));
    // create call
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 5 }] }));
    // reconcilePrimary: fetch all phones (none primary)
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 5, is_primary: false }] }));
    // reconcilePrimary: set new phone as primary
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 5 }] }));

    const result = await createPhone(42, { phone: '+1 555 123 4567', phoneTypeId: 2 });
    expect(result.isPrimary).toBe(true);
    expect(result.phoneType).toBe('Mobile');
  });
});

describe('isAddressPrimary', () => {
  it('returns true when address is primary', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1, is_primary: true }] }));
    expect(await isAddressPrimary(1)).toBe(true);
  });

  it('returns false when address is not primary', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1, is_primary: false }] }));
    expect(await isAddressPrimary(1)).toBe(false);
  });
});

describe('isPhonePrimary', () => {
  it('returns true when phone is primary', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [{ id: 1, is_primary: true }] }));
    expect(await isPhonePrimary(1)).toBe(true);
  });
});

describe('CiviCRM API error handling', () => {
  it('throws when CiviCRM returns non-200 status', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    await expect(getAddresses(42)).rejects.toThrow('CiviCRM API error: Address.get returned 500');
  });

  it('throws when CiviCRM returns 200 with error_message', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [], error_message: 'Permission denied' }));
    await expect(getAddresses(42)).rejects.toThrow('CiviCRM API error: Permission denied');
  });
});
