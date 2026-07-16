import { Router } from 'express';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { isJobQueueReady } from '../lib/job-queue.js';
import { getUploadsDir } from '../services/image-upload.service.js';

declare const __APP_VERSION__: string;
const appVersion = typeof __APP_VERSION__ === 'undefined' ? 'unknown' : __APP_VERSION__;

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', version: appVersion, timestamp: new Date().toISOString() });
});

router.get('/ready', async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      access(getUploadsDir(), constants.W_OK),
    ]);
    if (!isJobQueueReady()) {
      throw new Error('Job queue is not ready');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ready', version: appVersion });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ status: 'not_ready' });
  }
});

export { router as healthRoutes };
