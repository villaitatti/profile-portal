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

// Start pg-boss job queue and register workers BEFORE accepting HTTP
// traffic. Any earlier ordering creates a boot race where a form submit
// arriving between app.listen and the worker registration could enqueue
// against a not-yet-existing queue and lose the notification email.
const { registerFormNotificationWorker } = await import('./workers/form-notification.worker.js');
try {
  await registerFormNotificationWorker();
} catch (err) {
  // Queue bootstrap is considered fatal. Without it, every form submission
  // silently drops its notification email, and we'd rather fail loud at
  // boot than silently corrupt the pipeline.
  logger.error({ err }, 'Failed to start form notification worker — aborting boot');
  process.exit(1);
}

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server running');
});
