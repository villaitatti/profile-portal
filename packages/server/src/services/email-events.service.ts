import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getFellowsCached } from '../lib/fellows-cache.js';
import type { AppointeeEmailType } from '../generated/prisma/client.js';

// Read-side service for the admin email log (GET /api/admin/emails). Owns the
// filter → Prisma-where translation, cursor pagination, and the CiviCRM name
// join — query construction the route used to do inline.

export interface EmailEventRow {
  id: string;
  fellowshipId: number;
  contactId: number;
  appointeeName: string;
  academicYear: string;
  emailType: AppointeeEmailType;
  status: string;
  enqueuedAt: string;
  sentAt: string | null;
  updatedAt: string;
  triggeredBy: string;
  failureReason: string | null;
  sesMessageId: string | null;
}

export interface ListEmailEventsFilter {
  limit: number;
  cursor?: string;
  year?: string;
  type?: AppointeeEmailType;
  statuses: string[];
}

export async function listEmailEvents(
  filter: ListEmailEventsFilter
): Promise<{ events: EmailEventRow[]; nextCursor: string | null }> {
  const { limit, cursor, year, type, statuses } = filter;

  const where: Record<string, unknown> = {};
  if (year) where.academicYear = year;
  if (type) where.emailType = type;
  if (statuses.length === 1) where.status = statuses[0];
  else if (statuses.length > 1) where.status = { in: statuses };

  const events = await prisma.appointeeEmailEvent.findMany({
    where,
    take: limit + 1,
    orderBy: [{ enqueuedAt: 'desc' }, { id: 'desc' }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // Name join degrades gracefully: on CiviCRM failure the page still renders
  // with contactId fallbacks rather than 503ing the whole log.
  let nameMap: Map<number, string>;
  try {
    const fellows = await getFellowsCached('emails_admin');
    nameMap = new Map(
      fellows.map((f) => [f.contactId, `${f.firstName} ${f.lastName}`.trim()])
    );
  } catch (err) {
    logger.warn({ err }, 'Admin emails: CiviCRM unavailable for name join, degrading gracefully');
    nameMap = new Map();
  }

  const rows: EmailEventRow[] = page.map((e) => ({
    id: e.id,
    fellowshipId: e.fellowshipId,
    contactId: e.contactId,
    appointeeName: nameMap.get(e.contactId) || '?',
    academicYear: e.academicYear,
    emailType: e.emailType,
    status: e.status,
    enqueuedAt: e.enqueuedAt.toISOString(),
    sentAt: e.sentAt ? e.sentAt.toISOString() : null,
    updatedAt: e.updatedAt.toISOString(),
    triggeredBy: e.triggeredBy,
    failureReason: e.failureReason,
    sesMessageId: e.sesMessageId,
  }));

  return { events: rows, nextCursor };
}
