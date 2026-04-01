import { env } from '../env.js';
import type { CiviCRMContact, CiviCRMFellowship } from '@itatti/shared';

interface CiviApiResponse {
  values: Record<string, unknown>[];
}

async function apiCall(entity: string, action: string, params: Record<string, unknown>): Promise<CiviApiResponse> {
  const url = `${env.CIVICRM_BASE_URL}/civicrm/ajax/api4/${entity}/${action}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CIVICRM_API_KEY}`,
      'X-Civi-Key': env.CIVICRM_SITE_KEY,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ params }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`CiviCRM API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<CiviApiResponse>;
}

function parseContact(c: Record<string, unknown>, fallbackEmail?: string): CiviCRMContact {
  return {
    id: Number(c.id),
    firstName: String(c.first_name || ''),
    lastName: String(c.last_name || ''),
    email: String(c['email_primary.email'] || fallbackEmail || ''),
    phone: c['phone_primary.phone'] ? String(c['phone_primary.phone']) : undefined,
  };
}

export async function findContactByPrimaryEmail(
  email: string
): Promise<CiviCRMContact | null> {
  const result = await apiCall('Contact', 'get', {
    select: ['id', 'first_name', 'last_name', 'email_primary.email', 'phone_primary.phone'],
    where: [
      ['email_primary.email', '=', email],
      ['is_deleted', '=', false],
    ],
    limit: 1,
  });

  const contacts = result.values;
  if (!contacts || contacts.length === 0) return null;

  return parseContact(contacts[0], email);
}

export async function getContactById(contactId: number): Promise<CiviCRMContact | null> {
  const result = await apiCall('Contact', 'get', {
    select: ['id', 'first_name', 'last_name', 'email_primary.email', 'phone_primary.phone'],
    where: [
      ['id', '=', contactId],
      ['is_deleted', '=', false],
    ],
    limit: 1,
  });

  const contacts = result.values;
  if (!contacts || contacts.length === 0) return null;

  return parseContact(contacts[0]);
}

export interface CiviCRMFellowWithContact {
  contactId: number;
  firstName: string;
  lastName: string;
  email: string;
  fellowshipId: number;
  startDate: string;
  endDate: string;
  fellowshipAccepted?: boolean;
}

export async function getFellowsWithContacts(): Promise<CiviCRMFellowWithContact[]> {
  const entity = env.CIVICRM_FELLOWSHIP_ENTITY;
  const startField = env.CIVICRM_FIELD_START_DATE;
  const endField = env.CIVICRM_FIELD_END_DATE;
  const acceptedField = env.CIVICRM_FIELD_ACCEPTED;

  const result = await apiCall(entity, 'get', {
    select: [
      'id',
      'entity_id',
      startField,
      endField,
      acceptedField,
      'entity_id.first_name',
      'entity_id.last_name',
      'entity_id.email_primary.email',
    ],
    where: [['entity_id.is_deleted', '=', false]],
    orderBy: { [startField]: 'DESC' },
  });

  return (result.values || []).map((f) => ({
    contactId: Number(f.entity_id),
    firstName: String(f['entity_id.first_name'] || ''),
    lastName: String(f['entity_id.last_name'] || ''),
    email: String(f['entity_id.email_primary.email'] || ''),
    fellowshipId: Number(f.id),
    startDate: String(f[startField]),
    endDate: String(f[endField]),
    fellowshipAccepted: f[acceptedField] === true || f[acceptedField] === 1,
  }));
}

export async function getFellowships(contactId: number): Promise<CiviCRMFellowship[]> {
  const entity = env.CIVICRM_FELLOWSHIP_ENTITY;
  const startField = env.CIVICRM_FIELD_START_DATE;
  const endField = env.CIVICRM_FIELD_END_DATE;
  const acceptedField = env.CIVICRM_FIELD_ACCEPTED;

  const result = await apiCall(entity, 'get', {
    select: ['id', 'entity_id', startField, endField, acceptedField],
    where: [['entity_id', '=', contactId]],
    orderBy: { [startField]: 'ASC' },
  });

  const values = result.values || [];
  return values.map((f) => ({
    id: Number(f.id),
    contactId: Number(f.entity_id),
    startDate: String(f[startField]),
    endDate: String(f[endField]),
    fellowshipAccepted: f[acceptedField] === true || f[acceptedField] === 1,
  }));
}
