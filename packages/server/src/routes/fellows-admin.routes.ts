import { Router } from 'express';
import { isDevMode } from '../env.js';
import { getFellowsDashboard } from '../services/fellows.service.js';
import type { FellowsDashboardResponse } from '@itatti/shared';

const router = Router();

function getDevMockData(academicYear?: string): FellowsDashboardResponse {
  const fellows = [
    { civicrmId: 1, firstName: 'Maria', lastName: 'Rossi', email: 'm.rossi@unifi.it', appointment: 'Fellow', fellowship: 'NEH Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const },
    { civicrmId: 2, firstName: 'James', lastName: 'Chen', email: 'jchen@princeton.edu', appointment: 'Fellow', fellowship: 'Mellon Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const },
    { civicrmId: 3, firstName: 'Sophie', lastName: 'Laurent', email: 's.laurent@sorbonne.fr', appointment: 'Visiting Fellow', fellowship: 'Berenson Fellow', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'ok' as const },
    { civicrmId: 4, firstName: 'Alessandro', lastName: 'Bianchi', email: 'a.bianchi@uniroma1.it', appointment: 'Fellow', fellowship: 'Hanna Kiel Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const },
    { civicrmId: 5, firstName: 'Elena', lastName: 'Petrova', email: 'e.petrova@msu.ru', appointment: 'Visiting Fellow', fellowship: 'Wallace Fellow', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'missing' as const },
    { civicrmId: 6, firstName: 'David', lastName: 'Williams', email: 'd.williams@yale.edu', appointment: 'Fellow', fellowship: 'Robert Lehman Fellow', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'ok' as const },
    { civicrmId: 7, firstName: 'Lucia', lastName: 'Moreno', email: 'l.moreno@csic.es', appointment: 'Fellow', fellowship: 'CRIA Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const },
    { civicrmId: 8, firstName: 'Thomas', lastName: 'Müller', email: 't.mueller@uni-heidelberg.de', appointment: 'Fellow', fellowship: 'Florence Gould Fellow', fellowshipYear: '2024-2025', status: 'active' as const, civicrmIdStatus: 'ok' as const },
    { civicrmId: 9, firstName: 'Chiara', lastName: 'Conti', email: 'c.conti@unibo.it', appointment: 'Fellow', fellowship: 'Ahmanson Fellow', fellowshipYear: '2025-2026', status: 'no-account' as const, civicrmIdStatus: 'n/a' as const },
    { civicrmId: 10, firstName: 'Robert', lastName: 'Taylor', email: 'r.taylor@oxford.ac.uk', appointment: 'Visiting Professor', fellowship: 'Robert Lehman Visiting Professor', fellowshipYear: '2025-2026', status: 'active' as const, civicrmIdStatus: 'ok' as const },
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

export const fellowsAdminRoutes = router;
