import type { FellowsDashboardResponse, UserProfile } from '@itatti/shared';
import { KnownRoles } from '@itatti/shared';
import { deriveAppointmentCategory } from '../../services/fellows.service.js';
import { computeAppointeeStatus, type EmailEventStatus } from '../../services/appointee-status.js';
import type { EmailEventRow } from '../../services/email-events.service.js';

/**
 * Dev-mode (DEV_SKIP_EXTERNAL_SERVICES=true) fixtures, extracted from the
 * route modules so production code paths don't carry hundreds of lines of
 * hand-maintained mock data. Routes gate on isDevMode and call these; the
 * rows deliberately exercise every UI state (match-ladder tiers, email
 * palettes, needs-review reasons) so local development sees the full palette.
 */

export const DEV_PROFILE: UserProfile = {
  firstName: 'Dev',
  lastName: 'User',
  email: 'dev@itatti.harvard.edu',
  phone: '+39 055 603251',
  source: 'civicrm',
};

export const DEV_ROLES = [
  { id: 'rol_1', name: 'fellows', description: 'All appointees (former + current)' },
  { id: 'rol_2', name: 'fellows-current', description: 'Current academic year appointees' },
  { id: 'rol_3', name: KnownRoles.STAFF_IT, description: 'IT staff with admin access' },
];

export function getDevFellowsDashboard(academicYear?: string): FellowsDashboardResponse {
  const mockBioEmail = (variant: 'none' | 'pending' | 'sent' | 'failed', canSend: boolean, year: string) => ({
    status: variant,
    sentAt: variant === 'sent' ? '2026-04-10T09:00:00.000Z' : null,
    sendCount: variant === 'none' ? 0 : 1,
    targetAcademicYear: year,
    canManuallySend: canSend,
  });
  // Dev-mode rows reuse the bio-email summary shape for the VIT ID
  // invitation, then we augment with an appointeeStatus via the helper below.
  // Keeps the hand-maintained rows readable without duplicating 5 fields per row.
  type PartialEntry = Omit<
    FellowsDashboardResponse['fellows'][number],
    'vitIdInvitation' | 'appointeeStatus' | 'formInvitations' | 'fellowshipId'
  >;
  const partialRows: PartialEntry[] = [
    // Classic 'no-account' — first-time fellow, never been here before
    { civicrmId: 1, firstName: 'Maria', lastName: 'Rossi', email: 'm.rossi@unifi.it', appointment: 'Fellow', fellowship: 'NEH Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 2, firstName: 'James', lastName: 'Chen', email: 'jchen@princeton.edu', appointment: 'Fellow', fellowship: 'Mellon Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // Classic 'active' — matched via primary email
    { civicrmId: 3, firstName: 'Sophie', lastName: 'Laurent', email: 's.laurent@sorbonne.fr', appointment: 'Visiting Professor', fellowship: 'Berenson Fellow', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|sophie', email: 's.laurent@sorbonne.fr', civicrmId: '3', name: 'Sophie Laurent' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('sent', false, '2025-2026') },
    { civicrmId: 4, firstName: 'Alessandro', lastName: 'Bianchi', email: 'a.bianchi@uniroma1.it', appointment: 'Fellow', fellowship: 'Hanna Kiel Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // 'active' but civicrmId metadata missing — pre-existing flag
    { civicrmId: 5, firstName: 'Elena', lastName: 'Petrova', email: 'e.petrova@msu.ru', appointment: 'Visiting Professor', fellowship: 'Wallace Fellow', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|elena', email: 'e.petrova@msu.ru', civicrmId: null, name: 'Elena Petrova' }, civicrmIdStatus: 'missing', bioEmail: mockBioEmail('pending', false, '2025-2026') },
    { civicrmId: 6, firstName: 'David', lastName: 'Williams', email: 'd.williams@yale.edu', appointment: 'Fellow', fellowship: 'Robert Lehman Fellow', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|david', email: 'd.williams@yale.edu', civicrmId: '6', name: 'David Williams' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('failed', true, '2025-2026') },
    { civicrmId: 7, firstName: 'Lucia', lastName: 'Moreno', email: 'l.moreno@csic.es', appointment: 'Fellow', fellowship: 'CRIA Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'active-different-email' via civicrm_id (returning fellow, email changed)
    { civicrmId: 8, firstName: 'Thomas', lastName: 'Müller', email: 't.mueller.new@uni-heidelberg.de', appointment: 'Fellow', fellowship: 'Florence Gould Fellow', fellowshipYear: '2024-2025', status: 'active-different-email', matchedVia: 'civicrm-id', matched: { userId: 'auth0|thomas', email: 't.mueller@old-university.edu', civicrmId: '8', name: 'Thomas Müller' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('none', false, '2024-2025') },

    // NEW — 'active-different-email' via secondary-email
    { civicrmId: 11, firstName: 'Isabella', lastName: 'Ferrari', email: 'i.ferrari.new@unimi.it', appointment: 'Fellow', fellowship: 'Lila Wallace Fellow', fellowshipYear: '2025-2026', status: 'active-different-email', matchedVia: 'secondary-email', matched: { userId: 'auth0|isabella', email: 'i.ferrari.old@unimi.it', civicrmId: null, name: 'Isabella Ferrari' }, matchedViaEmail: 'i.ferrari.old@unimi.it', civicrmIdStatus: 'missing', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'active-different-email' via name (probable match)
    { civicrmId: 12, firstName: 'Henrik', lastName: 'Nielsen', email: 'h.nielsen@ku.dk', appointment: 'Visiting Professor', fellowship: 'Villa I Tatti Visiting Professor', fellowshipYear: '2025-2026', status: 'active-different-email', matchedVia: 'name', matched: { userId: 'auth0|henrik', email: 'henrik.n@gmail.com', civicrmId: null, name: 'Henrik Nielsen' }, civicrmIdStatus: 'missing', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'needs-review' with name-collision
    { civicrmId: 13, firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@unipd.it', appointment: 'Fellow', fellowship: 'Ahmanson Fellow', fellowshipYear: '2025-2026', status: 'needs-review', reason: 'name-collision', candidates: [
      { userId: 'auth0|marco1', email: 'marco.rossi.a@old.com', civicrmId: null, name: 'Marco Rossi' },
      { userId: 'auth0|marco2', email: 'marco.rossi.b@old.com', civicrmId: '999', name: 'Marco Rossi' },
    ], civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'needs-review' with tier-conflict
    { civicrmId: 14, firstName: 'Sarah', lastName: 'O\'Brien', email: 'sarah@trinitycollege.ie', appointment: 'Fellow', fellowship: 'CRIA Fellow', fellowshipYear: '2025-2026', status: 'needs-review', reason: 'tier-conflict', candidates: [
      { userId: 'auth0|sarah-civi', email: 'sarah.old@dublin.edu', civicrmId: '14', name: 'Sarah O\'Brien' },
      { userId: 'auth0|sarah-sec', email: 'sarah.maiden@old.com', civicrmId: null, name: 'Sarah Kelly' },
    ], civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    // NEW — 'needs-review' with primary-conflict (data drift)
    { civicrmId: 15, firstName: 'Giovanni', lastName: 'Verdi', email: 'g.verdi@unifi.it', appointment: 'Visiting Professor', fellowship: 'Wallace Fellow', fellowshipYear: '2025-2026', status: 'needs-review', reason: 'primary-conflict', candidates: [
      { userId: 'auth0|giovanni-1', email: 'g.verdi@unifi.it', civicrmId: null, name: 'Giovanni Verdi' },
      { userId: 'auth0|giovanni-2', email: 'g.verdi.other@unifi.it', civicrmId: '15', name: 'Giovanni Verdi' },
    ], civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },

    { civicrmId: 9, firstName: 'Chiara', lastName: 'Conti', email: 'c.conti@unibo.it', appointment: 'Fellow', fellowship: 'Ahmanson Fellow', fellowshipYear: '2025-2026', status: 'no-account', civicrmIdStatus: 'n/a', bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 10, firstName: 'Robert', lastName: 'Taylor', email: 'r.taylor@oxford.ac.uk', appointment: 'Visiting Professor', fellowship: 'Robert Lehman Visiting Professor', fellowshipYear: '2025-2026', status: 'active', matchedVia: 'primary-email', matched: { userId: 'auth0|robert', email: 'r.taylor@oxford.ac.uk', civicrmId: '10', name: 'Robert Taylor' }, civicrmIdStatus: 'ok', bioEmail: mockBioEmail('none', true, '2025-2026') },
  ];

  // Derive vitIdInvitation + appointeeStatus from each partial row so the
  // dev-mode dashboard exercises the full five-state palette without requiring
  // every mock row to be hand-maintained with the new fields.
  const fellows: FellowsDashboardResponse['fellows'] = partialRows.map((p) => {
    const hasVitId = p.status === 'active' || p.status === 'active-different-email';
    const isNeedsReview = p.status === 'needs-review';
    // Derive a plausible fellowshipAccepted from the mock data. For dev, treat
    // every row with a VIT ID or a bio email event as accepted; otherwise keep a
    // few no-account rows nominated so the palette still includes that state.
    const fellowshipAccepted =
      hasVitId ||
      p.bioEmail.status !== 'none' ||
      p.bioEmail.canManuallySend ||
      p.civicrmId === 1 ||
      p.civicrmId === 2;
    const vitIdInvitationStatus: EmailEventStatus =
      fellowshipAccepted && !hasVitId && !isNeedsReview && p.civicrmId === 2
        ? 'SENT'
        : 'NONE';
    const vitIdInvitation = {
      status: vitIdInvitationStatus === 'SENT' ? 'sent' as const : 'none' as const,
      sentAt:
        vitIdInvitationStatus === 'SENT' ? '2026-04-09T09:00:00.000Z' : null,
      sendCount: vitIdInvitationStatus === 'SENT' ? 1 : 0,
      targetAcademicYear: p.bioEmail.targetAcademicYear,
      canManuallySend:
        fellowshipAccepted &&
        !hasVitId &&
        !isNeedsReview &&
        p.bioEmail.targetAcademicYear !== null &&
        vitIdInvitationStatus !== 'SENT',
    };
    const bioEmailStatus: EmailEventStatus =
      p.bioEmail.status === 'sent' ? 'SENT' : 'NONE';
    const appointeeStatus = computeAppointeeStatus({
      fellowshipAccepted,
      vitIdTier: p.status,
      vitIdInvitationStatus,
      bioEmailStatus,
      nominationSent: false,
      formSubmitted: false,
    });
    return { ...p, fellowshipId: p.civicrmId * 100, vitIdInvitation, appointeeStatus, appointmentCategory: deriveAppointmentCategory(p.appointment, p.fellowship), formInvitations: [] };
  });

  const filtered = academicYear
    ? fellows.filter((f) => f.fellowshipYear === academicYear)
    : fellows;

  return {
    fellows: filtered,
    academicYears: ['2025-2026', '2024-2025'],
    summary: {
      total: filtered.length,
    },
  };
}

export function getDevEmailEvents(): EmailEventRow[] {
  return [
    {
      id: 'dev-evt-1',
      fellowshipId: 101,
      contactId: 3,
      appointeeName: 'Sophie Laurent',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SENT',
      enqueuedAt: '2026-04-10T07:00:00.000Z',
      sentAt: '2026-04-11T09:00:00.000Z',
      updatedAt: '2026-04-11T09:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: '0100018f-abcd-1234-5678-example',
    },
    {
      id: 'dev-evt-2',
      fellowshipId: 102,
      contactId: 2,
      appointeeName: 'James Chen',
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENT',
      enqueuedAt: '2026-04-08T10:00:00.000Z',
      sentAt: '2026-04-08T10:01:00.000Z',
      updatedAt: '2026-04-08T10:01:00.000Z',
      triggeredBy: 'admin_manual:auth0|andrea123:Andrea Caselli',
      failureReason: null,
      sesMessageId: '0100018f-efgh-5678-9012-example',
    },
    {
      id: 'dev-evt-3',
      fellowshipId: 103,
      contactId: 6,
      appointeeName: 'David Williams',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'FAILED',
      enqueuedAt: '2026-04-09T07:00:00.000Z',
      sentAt: null,
      updatedAt: '2026-04-10T09:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: 'SES rejected: Email address is not verified.',
      sesMessageId: null,
    },
    {
      id: 'dev-evt-4',
      fellowshipId: 104,
      contactId: 5,
      appointeeName: 'Elena Petrova',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'PENDING',
      enqueuedAt: '2026-04-27T14:00:00.000Z',
      sentAt: null,
      updatedAt: '2026-04-27T14:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: null,
      sesMessageId: null,
    },
    {
      id: 'dev-evt-5',
      fellowshipId: 105,
      contactId: 8,
      appointeeName: 'Thomas Müller',
      academicYear: '2024-2025',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SKIPPED',
      enqueuedAt: '2025-10-01T07:00:00.000Z',
      sentAt: null,
      updatedAt: '2025-10-02T09:00:00.000Z',
      triggeredBy: 'claim_auto',
      failureReason: 'no_matching_fellowship',
      sesMessageId: null,
    },
    {
      id: 'dev-evt-6',
      fellowshipId: 106,
      contactId: 10,
      appointeeName: 'Robert Taylor',
      academicYear: '2025-2026',
      emailType: 'VIT_ID_INVITATION',
      status: 'SENDING',
      enqueuedAt: '2026-04-27T15:00:00.000Z',
      sentAt: null,
      updatedAt: '2026-04-27T15:00:00.000Z',
      triggeredBy: 'admin_manual:auth0|angela456:Angela Nuova',
      failureReason: null,
      sesMessageId: null,
    },
    {
      id: 'dev-evt-7',
      fellowshipId: 101,
      contactId: 3,
      appointeeName: 'Sophie Laurent',
      academicYear: '2025-2026',
      emailType: 'BIO_PROJECT_DESCRIPTION',
      status: 'SENT',
      enqueuedAt: '2026-04-20T08:00:00.000Z',
      sentAt: '2026-04-20T08:01:00.000Z',
      updatedAt: '2026-04-20T08:01:00.000Z',
      triggeredBy: 'admin_manual:auth0|andrea123:Andrea Caselli',
      failureReason: null,
      sesMessageId: '0100018f-resend-1234-5678-example',
    },
  ];
}
