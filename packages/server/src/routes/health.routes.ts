import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../package.json'), 'utf-8'));

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', version: pkg.version, timestamp: new Date().toISOString() });
});

export { router as healthRoutes };
