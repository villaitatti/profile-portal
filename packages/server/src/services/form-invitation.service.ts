import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getFormDef, getFormsForAppointmentType } from '@itatti/shared';
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
  if (
    args.enforceAppointmentType &&
    (!args.appointmentType || !formDef.appointmentTypes.includes(args.appointmentType))
  ) {
    throw new ServiceError('No form configured for this appointment type', 400, {
      code: 'no_form_configured',
      appointmentType: args.appointmentType ?? null,
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

  const [updated, response] = await prisma.$transaction([
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

  return prisma.formInvitation.update({
    where: { id: invitationId },
    data: { nominationSentAt },
  });
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

export async function listInvitations(filters: {
  academicYear?: string;
  formType?: string;
  status?: string;
}): Promise<Array<{
  id: string;
  token: string;
  fellowshipId: number;
  contactId: number;
  academicYear: string;
  formType: string;
  status: string;
  nominationSentAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  response: { id: string; data: unknown; createdAt: Date } | null;
}>> {
  return prisma.formInvitation.findMany({
    where: {
      ...(filters.academicYear && { academicYear: filters.academicYear }),
      ...(filters.formType && { formType: filters.formType }),
      ...(filters.status && { status: filters.status }),
    },
    include: { response: true },
    orderBy: { createdAt: 'desc' },
  });
}

export function getAvailableFormsForAppointmentType(appointmentType: string) {
  return getFormsForAppointmentType(appointmentType);
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
