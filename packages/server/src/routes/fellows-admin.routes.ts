import { Router } from 'express';
import { z } from 'zod';
import { isDevMode } from '../env.js';
import { getFellowsDashboard } from '../services/fellows.service.js';
import * as appointeeEmailService from '../services/appointee-email.service.js';
import { logger } from '../lib/logger.js';
import type { FellowsDashboardResponse } from '@itatti/shared';

const router = Router();

function getDevMockData(academicYear?: string): FellowsDashboardResponse {
  const mockBioEmail = (variant: 'none' | 'pending' | 'sent' | 'failed', canSend: boolean, year: string) => ({
    status: variant,
    sentAt: variant === 'sent' ? '2026-04-10T09:00:00.000Z' : null,
    targetAcademicYear: year,
    canManuallySend: canSend,
  });
  const fellows = [
    { civicrmId: 1, firstName: 'Maria', lastName: 'Rossi', email: 'm.rossi@unifi.it', appointment: 'Fellow', fellowship: 'NEH Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const, bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 2, firstName: 'James', lastName: 'Chen', email: 'jchen@princeton.edu', appointment: 'Fellow', fellowship: 'Mellon Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const, bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 3, firstName: 'Sophie', lastName: 'Laurent', email: 's.laurent@sorbonne.fr', appointment: 'Visiting Fellow', fellowship: 'Berenson Fellow', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'ok' as const, bioEmail: mockBioEmail('sent', false, '2025-2026') },
    { civicrmId: 4, firstName: 'Alessandro', lastName: 'Bianchi', email: 'a.bianchi@uniroma1.it', appointment: 'Fellow', fellowship: 'Hanna Kiel Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const, bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 5, firstName: 'Elena', lastName: 'Petrova', email: 'e.petrova@msu.ru', appointment: 'Visiting Fellow', fellowship: 'Wallace Fellow', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'missing' as const, bioEmail: mockBioEmail('pending', false, '2025-2026') },
    { civicrmId: 6, firstName: 'David', lastName: 'Williams', email: 'd.williams@yale.edu', appointment: 'Fellow', fellowship: 'Robert Lehman Fellow', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'ok' as const, bioEmail: mockBioEmail('failed', true, '2025-2026') },
    { civicrmId: 7, firstName: 'Lucia', lastName: 'Moreno', email: 'l.moreno@csic.es', appointment: 'Fellow', fellowship: 'CRIA Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const, bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 8, firstName: 'Thomas', lastName: 'Müller', email: 't.mueller@uni-heidelberg.de', appointment: 'Fellow', fellowship: 'Florence Gould Fellow', fellowshipYear: '2024-2025', status: 'active' as const, civicrmIdStatus: 'ok' as const, bioEmail: mockBioEmail('none', false, '2024-2025') },
    { civicrmId: 9, firstName: 'Chiara', lastName: 'Conti', email: 'c.conti@unibo.it', appointment: 'Fellow', fellowship: 'Ahmanson Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const, bioEmail: mockBioEmail('none', false, '2025-2026') },
    { civicrmId: 10, firstName: 'Robert', lastName: 'Taylor', email: 'r.taylor@oxford.ac.uk', appointment: 'Visiting Professor', fellowship: 'Robert Lehman Visiting Professor', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'ok' as const, bioEmail: mockBioEmail('none', true, '2025-2026') },
  ];

  const filtered = academicYear
    ? fellows.filter((f) => f.fellowshipYear === academicYear)
    : fellows;

  return {
    fellows: filtered,
    academicYears: ['2025-2026', '2024-2025'],
    summary: {
      total: filtered.length,
      noAccount: filtered.filter((f) => f.status === 'no-account').length,
      active: filtered.filter((f) => f.status === 'active').length,
    },
  };
}

// GET /api/admin/fellows?academicYear=2025-2026
router.get('/', async (req, res, next) => {
  try {
    const academicYear = req.query.academicYear as string | undefined;

    if (isDevMode) {
      res.json(getDevMockData(academicYear));
      return;
    }

    const data = await getFellowsDashboard(academicYear);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/fellows/:contactId/send-bio-email
// Body: { academicYear: "YYYY-YYYY" }
// Returns:
//   200 { eventId, status, sentAt? }             — success (including in-flight PENDING/SENDING)
//   400 { error: "invalid_request", details? }   — malformed :contactId or body failed schema validation
//   400 { reason: BioEmailIneligibilityReason }  — eligibility precondition failed
//                                                  (no_vit_id / no_matching_fellowship / fellowship_not_accepted /
//                                                   no_primary_email / already_sent)
//   500 { error: "internal_error" }              — upstream (CiviCRM / Auth0 / SES) failure
const sendBioEmailBodySchema = z.object({
  academicYear: z.string().regex(/^\d{4}-\d{4}$/),
});

router.post('/:contactId/send-bio-email', async (req, res, next) => {
  try {
    const contactIdRaw = req.params.contactId;
    const contactId = Number(contactIdRaw);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      res
        .status(400)
        .json({ error: 'invalid_request', details: 'contactId must be a positive integer' });
      return;
    }

    const parsed = sendBioEmailBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_request',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    // Dev-mode short-circuit: pretend-send, no DB/CiviCRM/SES touched.
    if (isDevMode) {
      res.json({
        eventId: `dev-${contactId}-${parsed.data.academicYear}`,
        status: 'SENT',
        sentAt: new Date().toISOString(),
      });
      return;
    }

    const result = await appointeeEmailService.sendBioEmailManually({
      contactId,
      academicYear: parsed.data.academicYear,
      triggeredBy: `admin_manual:${req.userId || 'unknown'}`,
    });

    if (!result.ok) {
      res.status(400).json({ reason: result.reason });
      return;
    }

    res.json({
      eventId: result.eventId,
      status: result.status,
      sentAt: result.sentAt ? result.sentAt.toISOString() : null,
    });
  } catch (err) {
    logger.error({ err, contactId: req.params.contactId }, 'Admin: send-bio-email failed');
    res.status(500).json({ error: 'internal_error' });
  }
});

export const fellowsAdminRoutes = router;
