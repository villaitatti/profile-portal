import { createHash } from 'crypto';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { civiApiCall } from '../lib/civicrm-client.js';
import type { CiviCRMContact, CiviCRMFellowship } from '@itatti/shared';

// Deterministic short hash for log correlation. Matches the pattern in
// claim.service.ts so the same email produces the same hash across files.
function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 12);
}

// Cap on the IN-list size for a single Email.get call. I Tatti is well under
// this at any given time, but we chunk defensively so the query stays fast
// and doesn't trip any CiviCRM URL-length limits.
const EMAIL_GET_IN_CHUNK = 500;

function parseContact(c: Record<string, unknown>, fallbackEmail?: string): CiviCRMContact {
  return {
    id: Number(c.id),
    firstName: String(c.first_name || ''),
    lastName: String(c.last_name || ''),
    email: String(c['email_primary.email'] || fallbackEmail || ''),
    phone: c['phone_primary.phone'] ? String(c['phone_primary.phone']) : undefined,
    imageUrl: c.image_URL ? String(c.image_URL) : undefined,
  };
}

export async function findContactByPrimaryEmail(
  email: string
): Promise<CiviCRMContact | null> {
  const result = await civiApiCall('Contact', 'get', {
    select: ['id', 'first_name', 'last_name', 'email_primary.email', 'phone_primary.phone', 'image_URL'],
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
  const result = await civiApiCall('Contact', 'get', {
    select: ['id', 'first_name', 'last_name', 'email_primary.email', 'phone_primary.phone', 'image_URL'],
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
  imageUrl?: string;
  appointment?: string;
  fellowship?: string;
  fellowshipId: number;
  startDate: string;
  endDate: string;
  fellowshipAccepted?: boolean;
}

function parseFellowWithContact(
  f: Record<string, unknown>,
  fields: {
    startField: string;
    endField: string;
    acceptedField: string;
    appointmentField: string;
    fellowshipField: string;
  }
): CiviCRMFellowWithContact {
  return {
    contactId: Number(f.entity_id),
    firstName: String(f['entity_id.first_name'] || ''),
    lastName: String(f['entity_id.last_name'] || ''),
    email: String(f['entity_id.email_primary.email'] || ''),
    imageUrl: f['entity_id.image_URL'] ? String(f['entity_id.image_URL']) : undefined,
    appointment: f[fields.appointmentField] ? String(f[fields.appointmentField]) : undefined,
    fellowship: f[fields.fellowshipField] ? String(f[fields.fellowshipField]) : undefined,
    fellowshipId: Number(f.id),
    startDate: String(f[fields.startField]),
    endDate: String(f[fields.endField]),
    fellowshipAccepted: f[fields.acceptedField] === true || f[fields.acceptedField] === 1,
  };
}

function fellowshipFields() {
  return {
    startField: env.CIVICRM_FIELD_START_DATE,
    endField: env.CIVICRM_FIELD_END_DATE,
    acceptedField: env.CIVICRM_FIELD_ACCEPTED,
    appointmentField: env.CIVICRM_FIELD_APPOINTMENT,
    fellowshipField: env.CIVICRM_FIELD_FELLOWSHIP,
  };
}

function buildFellowSelect(fields: ReturnType<typeof fellowshipFields>): string[] {
  return [
    'id',
    'entity_id',
    fields.startField,
    fields.endField,
    fields.acceptedField,
    fields.appointmentField,
    fields.fellowshipField,
    'entity_id.first_name',
    'entity_id.last_name',
    'entity_id.email_primary.email',
    'entity_id.image_URL',
  ];
}

export async function getFellowsWithContacts(): Promise<CiviCRMFellowWithContact[]> {
  const entity = env.CIVICRM_FELLOWSHIP_ENTITY;
  const fields = fellowshipFields();

  const result = await civiApiCall(entity, 'get', {
    select: buildFellowSelect(fields),
    where: [['entity_id.is_deleted', '=', false]],
    orderBy: { [fields.startField]: 'DESC' },
  });

  return (result.values || []).map((f) => parseFellowWithContact(f, fields));
}

export async function getFellowWithContact(
  fellowshipId: number,
  contactId: number
): Promise<CiviCRMFellowWithContact | null> {
  const entity = env.CIVICRM_FELLOWSHIP_ENTITY;
  const fields = fellowshipFields();

  const result = await civiApiCall(entity, 'get', {
    select: buildFellowSelect(fields),
    where: [
      ['id', '=', fellowshipId],
      ['entity_id', '=', contactId],
      ['entity_id.is_deleted', '=', false],
    ],
    limit: 1,
  });

  const fellow = result.values?.[0];
  return fellow ? parseFellowWithContact(fellow, fields) : null;
}

export interface ContactEmails {
  primary: string | null;
  secondaries: string[];
}

/**
 * Batch-fetch the full email list per contact. Returns a Map keyed by
 * contact_id. Excludes on_hold emails entirely (bounced/unsubscribed =
 * matching noise). Deduplicates secondaries and excludes any that match the
 * contact's primary.
 *
 * Chunks the contact_id IN list at EMAIL_GET_IN_CHUNK to avoid URL-length
 * issues in very large cohorts.
 */
export async function getEmailsForContacts(
  contactIds: number[]
): Promise<Map<number, ContactEmails>> {
  const result = new Map<number, ContactEmails>();
  if (contactIds.length === 0) return result;

  // Intermediate accumulator — we need to see all rows per contact before
  // deciding primary vs secondaries, so we gather first then reduce.
  const rowsByContact = new Map<
    number,
    { email: string; is_primary: boolean }[]
  >();

  for (let i = 0; i < contactIds.length; i += EMAIL_GET_IN_CHUNK) {
    const chunk = contactIds.slice(i, i + EMAIL_GET_IN_CHUNK);
    const res = await civiApiCall('Email', 'get', {
      select: ['id', 'contact_id', 'email', 'is_primary', 'on_hold'],
      where: [
        ['contact_id', 'IN', chunk],
        ['on_hold', '=', 0],
      ],
      limit: 0, // 0 = unlimited in CiviCRM APIv4
    });

    for (const r of res.values || []) {
      const contactId = Number(r.contact_id);
      const email = String(r.email || '').trim();
      if (!email) continue;
      const existing = rowsByContact.get(contactId) ?? [];
      existing.push({ email, is_primary: !!r.is_primary });
      rowsByContact.set(contactId, existing);
    }
  }

  for (const [contactId, rows] of rowsByContact.entries()) {
    const primaryRow = rows.find((r) => r.is_primary);
    const primary = primaryRow ? primaryRow.email.toLowerCase() : null;
    const rawSecondaries = rows
      .filter((r) => !r.is_primary)
      .map((r) => r.email.toLowerCase());
    const secondaries = Array.from(new Set(rawSecondaries)).filter(
      (e) => e !== primary
    );
    result.set(contactId, { primary, secondaries });
  }

  return result;
}

export type FindContactByEmailResult =
  | { found: true; contactId: number }
  | { found: false; duplicate: true; contactIds: number[] }
  | { found: false };

/**
 * Reverse-lookup: given an email, find the CiviCRM contact id(s) that have
 * this email on any of their Email rows (primary or secondary).
 *
 * Returns duplicate=true when 2+ distinct contacts share the same email
 * (indicates a duplicate-contact data bug in CiviCRM). Callers surface this
 * as a `'needs-review'` state rather than guessing.
 *
 * Excludes deleted contacts. Excludes on_hold emails.
 */
export async function findContactIdByAnyEmail(
  email: string
): Promise<FindContactByEmailResult> {
  const res = await civiApiCall('Email', 'get', {
    select: ['contact_id'],
    where: [
      ['email', '=', email],
      ['on_hold', '=', 0],
      ['contact_id.is_deleted', '=', false],
    ],
    limit: 10,
  });

  const rows = res.values || [];
  const distinctContactIds = Array.from(
    new Set(rows.map((r) => Number(r.contact_id)).filter((id) => Number.isFinite(id)))
  );

  if (distinctContactIds.length === 0) {
    return { found: false };
  }
  if (distinctContactIds.length === 1) {
    return { found: true, contactId: distinctContactIds[0] };
  }
  logger.warn(
    { emailHash: hashEmail(email), contactIds: distinctContactIds },
    'CiviCRM data bug: same email on multiple contacts'
  );
  return { found: false, duplicate: true, contactIds: distinctContactIds };
}

export async function getFellowships(contactId: number): Promise<CiviCRMFellowship[]> {
  const entity = env.CIVICRM_FELLOWSHIP_ENTITY;
  const startField = env.CIVICRM_FIELD_START_DATE;
  const endField = env.CIVICRM_FIELD_END_DATE;
  const acceptedField = env.CIVICRM_FIELD_ACCEPTED;

  const result = await civiApiCall(entity, 'get', {
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
