import crypto from 'node:crypto';
import { Prisma, type FormInvitationStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import {
  buildRetiredFormTitle,
  getFormDef,
  getFormsForAppointmentType,
  getFormsForFellowship,
  isActiveFormDef,
} from '@itatti/shared';
import { buildFormSchema } from '../lib/form-schema.js';
import { hashToken } from '../lib/hash-token.js';
import { HttpError } from '../lib/http-error.js';
import { enqueueFormNotification } from '../workers/form-notification.worker.js';
import { logger } from '../lib/logger.js';
import type { FormResponseData } from '@itatti/shared';
import { env } from '../env.js';

const DEFAULT_INVITATION_TTL_DAYS = 180;

function nextInvitationExpiry(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() +
      (env.FORM_INVITATION_TTL_DAYS ?? DEFAULT_INVITATION_TTL_DAYS)
  );
  return expiresAt;
}

function isPendingInvitationExpired(invitation: { status: string; expiresAt: Date }): boolean {
  return invitation.status === 'pending' && invitation.expiresAt.getTime() <= Date.now();
}

async function expirePendingInvitations(): Promise<void> {
  await prisma.formInvitation.updateMany({
    where: { status: 'pending', expiresAt: { lte: new Date() } },
    data: { status: 'expired' },
  });
}

export interface GenerateInvitationArgs {
  fellowshipId: number;
  contactId: number;
  academicYear: string;
  formType: string;
  appointmentType?: string;
  fellowshipType?: string;
  enforceAppointmentType?: boolean;
  triggeredBy: string;
}

export interface GenerateInvitationResult {
  id: string;
  /**
   * Raw bearer token, returned exactly once — only its sha256 hash is stored
   * (lib/hash-token.ts), so it cannot be read back later. Empty string for a
   * submitted invitation, which has no live link to hand out.
   */
  token: string;
  formType: string;
  status: string;
  created: boolean;
}

export async function generateInvitation(
  args: GenerateInvitationArgs
): Promise<GenerateInvitationResult> {
  const formDef = getFormDef(args.formType);
  if (!formDef) {
    throw new ServiceError(`Unknown form type: ${args.formType}`, 400);
  }
  if (!isActiveFormDef(formDef)) {
    throw new ServiceError(`Form type is retired: ${args.formType}`, 400, {
      code: 'form_retired',
      formType: args.formType,
    });
  }

  // Dev mode passes enforceAppointmentType: false because local CiviCRM is not
  // populated. Production and direct service calls enforce the form mapping.
  if (
    args.enforceAppointmentType !== false &&
    !getFormsForFellowship(args.appointmentType ?? '', args.fellowshipType).some(
      (form) => form.id === formDef.id
    )
  ) {
    throw new ServiceError('No form configured for this appointment type', 400, {
      code: 'no_form_configured',
      appointmentType: args.appointmentType ?? null,
      fellowshipType: args.fellowshipType ?? null,
      formType: args.formType,
    });
  }

  const existing = await prisma.formInvitation.findUnique({
    where: {
      fellowshipId_formType_academicYear: {
        fellowshipId: args.fellowshipId,
        formType: args.formType,
        academicYear: args.academicYear,
      },
    },
  });

  if (existing) {
    // Submitted invitations are terminal for this endpoint — resetInvitation
    // is the explicit admin path that reopens one. There is no live link to
    // return (the token was revoked on submit and only hashes are stored).
    if (existing.status === 'submitted') {
      return {
        id: existing.id,
        token: '',
        formType: existing.formType,
        status: existing.status,
        created: false,
      };
    }

    // Pending or expired: rotate. Only the token's hash is stored, so "hand
    // back the existing link" is impossible — every generate call on a live
    // invitation mints a fresh token and invalidates the previous link.
    // Generate is an explicit admin action asking for a link to send out, so
    // the newest link winning is the intended semantics.
    const token = crypto.randomBytes(32).toString('base64url');
    const rotated = await prisma.formInvitation.updateMany({
      where: {
        id: existing.id,
        tokenHash: existing.tokenHash,
        status: existing.status,
      },
      data: {
        tokenHash: hashToken(token),
        status: 'pending',
        submittedAt: null,
        expiresAt: nextInvitationExpiry(),
      },
    });
    // A concurrent generate/reset/submit won the compare-and-swap. The winner
    // already received its raw token; the loser cannot recover it from the
    // hash, so surface the conflict and let the admin retry.
    if (rotated.count === 0) {
      throw new ServiceError('Invitation was regenerated concurrently', 409);
    }
    return {
      id: existing.id,
      token,
      formType: existing.formType,
      status: 'pending',
      created: false,
    };
  }

  const token = crypto.randomBytes(32).toString('base64url');

  const invitation = await prisma.formInvitation.create({
    data: {
      tokenHash: hashToken(token),
      fellowshipId: args.fellowshipId,
      contactId: args.contactId,
      academicYear: args.academicYear,
      formType: args.formType,
      expiresAt: nextInvitationExpiry(),
    },
  });

  logger.info(
    { invitationId: invitation.id, formType: args.formType, triggeredBy: args.triggeredBy },
    'form_invitation_created'
  );

  return {
    id: invitation.id,
    token,
    formType: invitation.formType,
    status: invitation.status,
    created: true,
  };
}

export interface SubmitFormResult {
  invitationId: string;
  responseId: string;
}

export async function submitForm(
  token: string,
  rawData: Record<string, unknown>
): Promise<SubmitFormResult> {
  const tokenHash = hashToken(token);
  const invitation = await prisma.formInvitation.findUnique({ where: { tokenHash } });
  if (!invitation) {
    throw new ServiceError('Invalid form link', 404);
  }

  if (invitation.status === 'expired' || invitation.expiresAt.getTime() <= Date.now()) {
    if (invitation.status === 'pending') {
      const result = await prisma.formInvitation.updateMany({
        where: {
          id: invitation.id,
          status: 'pending',
          expiresAt: { lte: new Date() },
        },
        data: { status: 'expired' },
      });
      if (result.count === 0) {
        const current = await prisma.formInvitation.findUnique({ where: { tokenHash } });
        if (!current) throw new ServiceError('Invalid form link', 404);
        if (current.status === 'submitted') {
          throw new ServiceError('This form has already been submitted', 409);
        }
      }
    }
    throw new ServiceError('This form link has expired', 410);
  }

  if (invitation.status === 'submitted') {
    throw new ServiceError('This form has already been submitted', 409);
  }

  const formDef = getFormDef(invitation.formType);
  if (!formDef) {
    throw new ServiceError('Form definition not found', 500);
  }

  const schema = buildFormSchema(formDef);
  const parsed = schema.safeParse(rawData);
  if (!parsed.success) {
    throw new ServiceError('Validation failed', 400, parsed.error.issues);
  }

  const data = parsed.data as FormResponseData;

  let response;
  // The raw revoked token is discarded immediately — only its hash lands in
  // the row, purely to invalidate the submitted link.
  const revokedTokenHash = hashToken(crypto.randomBytes(32).toString('base64url'));
  try {
    response = await prisma.$transaction(async (tx) => {
      const submittedAt = new Date();
      const claimed = await tx.formInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash,
          status: 'pending',
          expiresAt: { gt: submittedAt },
        },
        data: { status: 'submitted', submittedAt, tokenHash: revokedTokenHash },
      });
      if (claimed.count !== 1) throw new InvitationClaimConflict();

      return tx.formResponse.create({
        data: { invitationId: invitation.id, data },
      });
    });
  } catch (err) {
    if (!(err instanceof InvitationClaimConflict)) throw err;

    // A concurrent submit, expiry, or token rotation won after the first
    // read. Resolve the current state only after the failed transaction has
    // rolled back so an old token cannot claim a freshly reset invitation.
    const current = await prisma.formInvitation.findUnique({ where: { tokenHash } });
    if (!current) throw new ServiceError('Invalid form link', 404);
    if (current.status === 'submitted') {
      throw new ServiceError('This form has already been submitted', 409);
    }
    if (current.status === 'expired' || isPendingInvitationExpired(current)) {
      throw new ServiceError('This form link has expired', 410);
    }
    throw new ServiceError('This form is no longer available', 409);
  }

  logger.info(
    { invitationId: invitation.id, responseId: response.id },
    'form_submission_received'
  );

  await enqueueFormNotification({ invitationId: invitation.id, responseId: response.id }).catch(
    (err) => logger.error({ err, invitationId: invitation.id }, 'failed to enqueue form notification')
  );

  return { invitationId: invitation.id, responseId: response.id };
}

export async function getInvitationByToken(token: string) {
  const tokenHash = hashToken(token);
  let invitation = await prisma.formInvitation.findUnique({ where: { tokenHash } });
  if (!invitation) return null;

  if (invitation.status === 'expired' || invitation.expiresAt.getTime() <= Date.now()) {
    if (isPendingInvitationExpired(invitation)) {
      const result = await prisma.formInvitation.updateMany({
        where: {
          id: invitation.id,
          status: 'pending',
          expiresAt: { lte: new Date() },
        },
        data: { status: 'expired' },
      });
      if (result.count === 0) {
        // A concurrent submit or reset won the race. Re-read by bearer token so
        // an old link can never observe the replacement invitation.
        invitation = await prisma.formInvitation.findUnique({ where: { tokenHash } });
        if (!invitation) return null;
      }
    }
    throw new ServiceError('This form link has expired', 410);
  }

  const formDef = getFormDef(invitation.formType);
  return { invitation, formDef };
}

export async function getResponseByInvitationId(invitationId: string) {
  return prisma.formResponse.findUnique({ where: { invitationId } });
}

export async function markNominationSent(invitationId: string, nominationSentOn?: string) {
  const nominationSentAt = nominationSentOn
    ? parseNominationSentDate(nominationSentOn)
    : new Date();

  try {
    return await prisma.formInvitation.update({
      where: { id: invitationId, status: 'pending' },
      data: { nominationSentAt },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        throw new ServiceError('Form invitation is not pending or does not exist', 409, {
          code: 'nomination_sent_not_allowed',
        });
      }
      // Prisma internals (error code, message) go to the log, never into the
      // response — the error middleware renders ServiceError.details verbatim.
      logger.error({ err, invitationId, prismaCode: err.code }, 'mark_nomination_sent_failed');
      throw new ServiceError('Could not mark nomination as sent', 500);
    }
    throw err;
  }
}

function parseNominationSentDate(nominationSentOn: string): Date {
  const nominationSentAt = new Date(`${nominationSentOn}T12:00:00.000Z`);
  if (
    Number.isNaN(nominationSentAt.getTime()) ||
    nominationSentAt.toISOString().slice(0, 10) !== nominationSentOn
  ) {
    throw new ServiceError('Invalid nomination sent date', 400, {
      code: 'invalid_nomination_sent_on',
      nominationSentOn,
    });
  }
  return nominationSentAt;
}

export async function resetInvitation(invitationId: string, triggeredBy: string) {
  const newToken = crypto.randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    const invitation = await tx.formInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new ServiceError('Invitation not found', 404);

    // Rotate first, then delete. If a concurrent submit wins the row lock, its
    // response is visible to the following delete. If reset wins, the submit's
    // old-token compare-and-swap fails and cannot create a response.
    try {
      await tx.formInvitation.update({
        where: { id: invitationId, tokenHash: invitation.tokenHash },
        data: {
          tokenHash: hashToken(newToken),
          status: 'pending',
          submittedAt: null,
          expiresAt: nextInvitationExpiry(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ServiceError('Invitation was reset concurrently', 409);
      }
      throw err;
    }
    await tx.formResponse.deleteMany({ where: { invitationId } });
  });

  logger.info(
    { invitationId, triggeredBy },
    'form_invitation_reset'
  );

  return { token: newToken };
}

export async function getInvitationsForContacts(contactIds: number[]) {
  if (contactIds.length === 0) return [];
  await expirePendingInvitations();
  return prisma.formInvitation.findMany({
    where: { contactId: { in: contactIds } },
    include: { response: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInvitationsForFellowship(fellowshipId: number, academicYear: string) {
  await expirePendingInvitations();
  return prisma.formInvitation.findMany({
    where: { fellowshipId, academicYear },
    include: { response: true },
    orderBy: { createdAt: 'desc' },
  });
}

export interface InvitationListItem {
  id: string;
  // NOTE: neither the token nor its stored hash is exposed here. Tokens are
  // the key to the unauthenticated GET /api/forms/:token public endpoint, and
  // since only sha256 hashes are stored (lib/hash-token.ts) there is no raw
  // token to read back anyway. Archive callers do not need it; issuing a
  // usable link goes through generateInvitation, which returns the fresh raw
  // token exactly once.
  fellowshipId: number;
  contactId: number;
  contactName: string | null;
  academicYear: string;
  formType: string;
  formTitle: string;
  status: string;
  nominationSentAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Presence-only signal — the full response data is deliberately NOT
  // loaded by the list query. Callers that need the response data use
  // getResponseByInvitationId. Keeping the archive list path light avoids
  // pulling every submission's PII into server memory on every /admin/forms
  // fetch. The route returns this as `hasResponse: boolean`.
  hasResponse: boolean;
}

export interface InvitationListResult {
  items: InvitationListItem[];
  facets: {
    academicYears: string[];
    formTypes: string[];
  };
  /** True when more rows matched than the archive cap returned. */
  truncated: boolean;
}

// The archive list is bounded so unbounded growth (one row per invitation,
// forever) can't degrade the admin page or the name-join loop. Well above a
// realistic filtered view; when exceeded the response says so explicitly
// (`truncated: true`) instead of silently dropping rows.
const INVITATION_LIST_MAX = 1000;

export interface NameLookup {
  getName(contactId: number): string | null;
}

/**
 * List invitations with joined appointee name + form title, plus facet values.
 *
 * Data flow (items and facets queries run CONCURRENTLY via Promise.all):
 *
 *   filters ──┬─▶ Prisma.findMany (items, sorted submittedAt DESC, id DESC)
 *             │
 *             └─▶ Prisma.findMany (facet rows, IGNORES academicYear/formType
 *                                  so the dropdowns stay stable as filters
 *                                  change — only the status filter applies)
 *        ┃
 *        ▼
 *   both resolve ──▶ nameLookup.getName(contactId) per item (null on miss)
 *               ──▶ getFormDef(formType).title per item
 *                   ("(retired form: ...)" on miss)
 *
 * Name resolution is injected so the caller owns caching. Callers that do not
 * want name resolution (or want to degrade gracefully on a CiviCRM failure)
 * pass a lookup whose getName returns null — items still carry contactId so
 * the UI can render a fallback.
 */
export async function listInvitations(
  filters: {
    academicYear?: string;
    formType?: string;
    status?: FormInvitationStatus;
  },
  nameLookup?: NameLookup
): Promise<InvitationListResult> {
  await expirePendingInvitations();
  const where = {
    ...(filters.academicYear && { academicYear: filters.academicYear }),
    ...(filters.formType && { formType: filters.formType }),
    ...(filters.status && { status: filters.status }),
  };

  const facetWhere = {
    ...(filters.status && { status: filters.status }),
  };

  const [allRows, facetRows] = await Promise.all([
    prisma.formInvitation.findMany({
      where,
      // Project only the presence of the response relation (id only, no
      // data). The archive list does not need the response JSON — callers
      // that need it go through getResponseByInvitationId. This keeps PII
      // out of the hot list-query path and avoids pulling every submitted
      // response into server memory on every /admin/forms fetch.
      include: { response: { select: { id: true } } },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: INVITATION_LIST_MAX + 1,
    }),
    prisma.formInvitation.findMany({
      where: facetWhere,
      select: { academicYear: true, formType: true },
    }),
  ]);

  const truncated = allRows.length > INVITATION_LIST_MAX;
  const rows = truncated ? allRows.slice(0, INVITATION_LIST_MAX) : allRows;

  const items: InvitationListItem[] = rows.map((inv) => {
    const formDef = getFormDef(inv.formType);
    // Explicit field list (no `...inv` spread) so the `tokenHash` field on
    // the Prisma row never makes it into the archive contract.
    return {
      id: inv.id,
      fellowshipId: inv.fellowshipId,
      contactId: inv.contactId,
      contactName: nameLookup?.getName(inv.contactId) ?? null,
      academicYear: inv.academicYear,
      formType: inv.formType,
      formTitle: formDef ? formDef.title : buildRetiredFormTitle(inv.formType),
      status: inv.status,
      nominationSentAt: inv.nominationSentAt,
      submittedAt: inv.submittedAt,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
      hasResponse: inv.response !== null,
    };
  });

  // Lexicographic desc is correct for fixed-width "YYYY-YYYY" academic-year
  // strings ("2026-2027" > "2025-2026"). If the year format ever changes
  // (e.g. "FY27" or a fiscal prefix), swap this for a numeric-prefix sort.
  const academicYears = Array.from(new Set(facetRows.map((r) => r.academicYear))).sort().reverse();
  const formTypes = Array.from(new Set(facetRows.map((r) => r.formType))).sort();

  return { items, facets: { academicYears, formTypes }, truncated };
}

export function getAvailableFormsForAppointmentType(
  appointmentType: string,
  fellowshipType?: string
) {
  return fellowshipType
    ? getFormsForFellowship(appointmentType, fellowshipType)
    : getFormsForAppointmentType(appointmentType);
}

class InvitationClaimConflict extends Error {}

// Default codes by status for ServiceError throws that don't need a bespoke
// one. The route layer no longer maps ServiceError by hand — it extends
// HttpError, so middleware/error.ts renders it as { error, code, details? }.
const SERVICE_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  500: 'INTERNAL_ERROR',
};

export class ServiceError extends HttpError {
  constructor(message: string, statusCode: number, details?: unknown) {
    super(statusCode, message, SERVICE_ERROR_CODES[statusCode] ?? 'REQUEST_ERROR', details);
    this.name = 'ServiceError';
  }

  /** Legacy alias — pre-HttpError call sites and tests read statusCode. */
  get statusCode(): number {
    return this.status;
  }
}
