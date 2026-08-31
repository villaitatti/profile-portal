import crypto from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import {
  buildRetiredFormTitle,
  getFormDef,
  getFormsForAppointmentType,
  getFormsForFellowship,
  isActiveFormDef,
} from '@itatti/shared';
import { buildFormSchema } from '../lib/form-schema.js';
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
    if (existing.status === 'expired' || isPendingInvitationExpired(existing)) {
      const token = crypto.randomBytes(32).toString('base64url');
      const rotated = await prisma.formInvitation.updateMany({
        where: {
          id: existing.id,
          token: existing.token,
          status: existing.status,
        },
        data: {
          token,
          status: 'pending',
          submittedAt: null,
          expiresAt: nextInvitationExpiry(),
        },
      });
      const current = await prisma.formInvitation.findUnique({ where: { id: existing.id } });
      if (!current) throw new ServiceError('Invitation not found after rotation', 409);
      if (rotated.count === 0 && current.status === 'expired') {
        throw new ServiceError('Invitation was regenerated concurrently', 409);
      }
      return {
        id: current.id,
        token: current.token,
        formType: current.formType,
        status: current.status,
        created: false,
      };
    }
    return {
      id: existing.id,
      token: existing.token,
      formType: existing.formType,
      status: existing.status,
      created: false,
    };
  }

  const token = crypto.randomBytes(32).toString('base64url');

  const invitation = await prisma.formInvitation.create({
    data: {
      token,
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
    token: invitation.token,
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
  const invitation = await prisma.formInvitation.findUnique({ where: { token } });
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
        const current = await prisma.formInvitation.findUnique({ where: { token } });
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
  const revokedToken = crypto.randomBytes(32).toString('base64url');
  try {
    response = await prisma.$transaction(async (tx) => {
      const submittedAt = new Date();
      const claimed = await tx.formInvitation.updateMany({
        where: {
          id: invitation.id,
          token,
          status: 'pending',
          expiresAt: { gt: submittedAt },
        },
        data: { status: 'submitted', submittedAt, token: revokedToken },
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
    const current = await prisma.formInvitation.findUnique({ where: { token } });
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
  let invitation = await prisma.formInvitation.findUnique({ where: { token } });
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
        invitation = await prisma.formInvitation.findUnique({ where: { token } });
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
      throw new ServiceError(
        err.code === 'P2025'
          ? 'Form invitation is not pending or does not exist'
          : 'Could not mark nomination as sent',
        err.code === 'P2025' ? 409 : 500,
        {
          code: err.code === 'P2025' ? 'nomination_sent_not_allowed' : 'prisma_error',
          prismaCode: err.code,
          originalError: {
            name: err.name,
            message: err.message,
          },
        }
      );
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
        where: { id: invitationId, token: invitation.token },
        data: {
          token: newToken,
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
  // NOTE: token is deliberately NOT exposed here. Tokens are the key to the
  // unauthenticated GET /api/forms/:token public endpoint. Even though that
  // endpoint no longer returns response data, the bearer URL still grants
  // access to the form lifecycle. Archive callers do not need it. Callers that
  // genuinely need the token (for example the fellows dashboard copy-link
  // action) use getInvitationsForContacts instead.
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
}

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
    status?: string;
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

  const [rows, facetRows] = await Promise.all([
    prisma.formInvitation.findMany({
      where,
      // Project only the presence of the response relation (id only, no
      // data). The archive list does not need the response JSON — callers
      // that need it go through getResponseByInvitationId. This keeps PII
      // out of the hot list-query path and avoids pulling every submitted
      // response into server memory on every /admin/forms fetch.
      include: { response: { select: { id: true } } },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.formInvitation.findMany({
      where: facetWhere,
      select: { academicYear: true, formType: true },
    }),
  ]);

  const items: InvitationListItem[] = rows.map((inv) => {
    const formDef = getFormDef(inv.formType);
    // Explicit field list (no `...inv` spread) so the sensitive `token`
    // field on the Prisma row never makes it into the archive contract.
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

  return { items, facets: { academicYears, formTypes } };
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
