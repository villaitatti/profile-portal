import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  buildRetiredFormTitle,
  getFormDef,
  getFormsForAppointmentType,
  getFormsForFellowship,
  isActiveFormDef,
} from '@itatti/shared';
import { buildFormSchema } from '../lib/form-schema.js';
import { enqueueFormNotification } from '../workers/form-notification.worker.js';
import { logger } from '../lib/logger.js';
import type { FormResponseData } from '@itatti/shared';

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

  const [, response] = await prisma.$transaction([
    prisma.formInvitation.update({
      where: { id: invitation.id, status: 'pending' },
      data: { status: 'submitted', submittedAt: new Date() },
    }),
    prisma.formResponse.create({
      data: { invitationId: invitation.id, data },
    }),
  ]).catch((err) => {
    if (err.code === 'P2025') {
      throw new ServiceError('This form has already been submitted', 409);
    }
    throw err;
  });

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
  const invitation = await prisma.formInvitation.findUnique({
    where: { token },
    include: { response: true },
  });
  if (!invitation) return null;

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
  const invitation = await prisma.formInvitation.findUnique({
    where: { id: invitationId },
    include: { response: true },
  });

  if (!invitation) {
    throw new ServiceError('Invitation not found', 404);
  }

  const newToken = crypto.randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    if (invitation.response) {
      await tx.formResponse.delete({ where: { invitationId: invitation.id } });
    }
    await tx.formInvitation.update({
      where: { id: invitation.id },
      data: { token: newToken, status: 'pending', submittedAt: null },
    });
  });

  logger.info(
    { invitationId, triggeredBy },
    'form_invitation_reset'
  );

  return { token: newToken };
}

export async function getInvitationsForContacts(contactIds: number[]) {
  if (contactIds.length === 0) return [];
  return prisma.formInvitation.findMany({
    where: { contactId: { in: contactIds } },
    include: { response: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInvitationsForFellowship(fellowshipId: number, academicYear: string) {
  return prisma.formInvitation.findMany({
    where: { fellowshipId, academicYear },
    include: { response: true },
    orderBy: { createdAt: 'desc' },
  });
}

export interface InvitationListItem {
  id: string;
  // NOTE: token is deliberately NOT exposed here. Tokens are the key to the
  // unauthenticated GET /api/forms/:token public endpoint that returns
  // submitted response data. The submissions-archive use case for this
  // function has no need for them, and keeping the field off the interface
  // prevents a future in-process caller from accidentally logging or
  // forwarding it. Callers that genuinely need the token (e.g., fellows
  // dashboard "copy link" action) use getInvitationsForContacts instead.
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

export class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
