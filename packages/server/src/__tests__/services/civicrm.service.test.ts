import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../env.js', () => ({
  env: {
    CIVICRM_BASE_URL: 'https://civi.test',
    CIVICRM_API_KEY: 'test-key',
    CIVICRM_SITE_KEY: 'test-site-key',
    CIVICRM_FELLOWSHIP_ENTITY: 'Fellowship',
    CIVICRM_FIELD_START_DATE: 'start_date',
    CIVICRM_FIELD_END_DATE: 'end_date',
    CIVICRM_FIELD_ACCEPTED: 'accepted',
    CIVICRM_FIELD_APPOINTMENT: 'appointment',
    CIVICRM_FIELD_FELLOWSHIP: 'fellowship',
  },
  isDevMode: false,
}));

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: { warn: mockWarn, error: vi.fn(), info: vi.fn() },
}));

import {
  getEmailsForContacts,
  findContactIdByAnyEmail,
} from '../../services/civicrm.service.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  mockWarn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getEmailsForContacts', () => {
  it('returns empty Map when given empty input', async () => {
    const result = await getEmailsForContacts([]);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('splits primary and secondaries for a single contact', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        values: [
          { id: 1, contact_id: 42, email: 'primary@x.com', is_primary: true, on_hold: 0 },
          { id: 2, contact_id: 42, email: 'alt1@x.com', is_primary: false, on_hold: 0 },
          { id: 3, contact_id: 42, email: 'alt2@x.com', is_primary: false, on_hold: 0 },
        ],
      })
    );

    const result = await getEmailsForContacts([42]);

    expect(result.size).toBe(1);
    expect(result.get(42)).toEqual({
      primary: 'primary@x.com',
      secondaries: ['alt1@x.com', 'alt2@x.com'],
    });
  });

  it('filters on_hold emails server-side (query includes on_hold = 0)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));

    await getEmailsForContacts([1, 2, 3]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = mockFetch.mock.calls[0][1].body as string;
    const params = new URLSearchParams(body);
    const payload = JSON.parse(params.get('params')!);
    expect(payload.where).toContainEqual(['on_hold', '=', 0]);
    expect(payload.where).toContainEqual(['contact_id', 'IN', [1, 2, 3]]);
  });

  it('dedupes secondaries (case-insensitive, lowercased) and excludes primary', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        values: [
          { id: 1, contact_id: 7, email: 'main@x.com', is_primary: true, on_hold: 0 },
          { id: 2, contact_id: 7, email: 'Same@X.com', is_primary: false, on_hold: 0 },
          { id: 3, contact_id: 7, email: 'same@x.com', is_primary: false, on_hold: 0 },
          { id: 4, contact_id: 7, email: 'MAIN@X.COM', is_primary: false, on_hold: 0 },
        ],
      })
    );

    const result = await getEmailsForContacts([7]);

    expect(result.get(7)).toEqual({
      primary: 'main@x.com',
      secondaries: ['same@x.com'],
    });
  });

  it('handles contact with no primary (all rows is_primary=false)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        values: [
          { id: 1, contact_id: 9, email: 'first@x.com', is_primary: false, on_hold: 0 },
          { id: 2, contact_id: 9, email: 'second@x.com', is_primary: false, on_hold: 0 },
        ],
      })
    );

    const result = await getEmailsForContacts([9]);

    expect(result.get(9)).toEqual({
      primary: null,
      secondaries: ['first@x.com', 'second@x.com'],
    });
  });

  it('chunks the contact_id IN list when it exceeds 500', async () => {
    // Create 501 IDs; expect two fetch calls.
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ values: [] }))
      .mockResolvedValueOnce(jsonResponse({ values: [] }));

    await getEmailsForContacts(ids);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    const firstPayload = JSON.parse(firstBody.get('params')!);
    expect(firstPayload.where.find((w: unknown[]) => w[0] === 'contact_id')[2]).toHaveLength(500);

    const secondBody = new URLSearchParams(mockFetch.mock.calls[1][1].body);
    const secondPayload = JSON.parse(secondBody.get('params')!);
    expect(secondPayload.where.find((w: unknown[]) => w[0] === 'contact_id')[2]).toHaveLength(1);
  });

  it('skips rows with empty email strings', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        values: [
          { id: 1, contact_id: 5, email: '', is_primary: true, on_hold: 0 },
          { id: 2, contact_id: 5, email: 'real@x.com', is_primary: false, on_hold: 0 },
        ],
      })
    );

    const result = await getEmailsForContacts([5]);

    expect(result.get(5)).toEqual({
      primary: null,
      secondaries: ['real@x.com'],
    });
  });
});

describe('findContactIdByAnyEmail', () => {
  it('returns { found: false } when no rows', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));

    const result = await findContactIdByAnyEmail('nobody@x.com');

    expect(result).toEqual({ found: false });
  });

  it('returns { found: true, contactId } when single row', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ values: [{ contact_id: 123 }] })
    );

    const result = await findContactIdByAnyEmail('someone@x.com');

    expect(result).toEqual({ found: true, contactId: 123 });
  });

  it('deduplicates when multiple rows point to the same contact', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        values: [{ contact_id: 42 }, { contact_id: 42 }, { contact_id: 42 }],
      })
    );

    const result = await findContactIdByAnyEmail('has-multiple-rows@x.com');

    expect(result).toEqual({ found: true, contactId: 42 });
  });

  it('returns { found: false, duplicate: true, contactIds } when 2+ distinct contacts + logs warning', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ values: [{ contact_id: 10 }, { contact_id: 20 }] })
    );

    const result = await findContactIdByAnyEmail('shared@x.com');

    expect(result).toEqual({ found: false, duplicate: true, contactIds: [10, 20] });
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [ctx, msg] = mockWarn.mock.calls[0];
    expect(ctx).toEqual({ email: 'shared@x.com', contactIds: [10, 20] });
    expect(msg).toContain('multiple contacts');
  });

  it('excludes deleted contacts and on_hold emails in the query', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ values: [] }));

    await findContactIdByAnyEmail('x@y.z');

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    const payload = JSON.parse(body.get('params')!);
    expect(payload.where).toContainEqual(['email', '=', 'x@y.z']);
    expect(payload.where).toContainEqual(['on_hold', '=', 0]);
    expect(payload.where).toContainEqual(['contact_id.is_deleted', '=', false]);
  });
});
