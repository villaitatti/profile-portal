import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root BEFORE any other imports
config({ path: resolve(import.meta.dirname, '../../../.env') });

// Now import everything else
const { env } = await import('./env.js');
const { logger } = await import('./lib/logger.js');
const { default: app } = await import('./app.js');

logger.info({ mode: env.NODE_ENV }, 'Starting server');

// Register automation cron jobs (July 1 + July 2 at 04:00 UTC)
const { registerCronJobs } = await import('./services/automation.service.js');
registerCronJobs();

// Start pg-boss job queue and register workers
const { registerFormNotificationWorker } = await import('./workers/form-notification.worker.js');
registerFormNotificationWorker().catch((err) => {
  logger.error({ err }, 'Failed to start form notification worker');
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server running');
});
