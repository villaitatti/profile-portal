import { Router } from 'express';

declare const __APP_VERSION__: string;

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', version: __APP_VERSION__, timestamp: new Date().toISOString() });
});

export { router as healthRoutes };
