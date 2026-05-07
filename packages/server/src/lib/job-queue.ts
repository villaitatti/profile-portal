import PgBoss from 'pg-boss';
import { env } from '../env.js';
import { logger } from './logger.js';

let boss: PgBoss | null = null;

export async function getJobQueue(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 24 * 60 * 60,
    archiveCompletedAfterSeconds: 7 * 24 * 60 * 60,
  });

  boss.on('error', (err) => {
    logger.error({ err }, 'pg-boss error');
  });

  await boss.start();

  // Create every declared queue up front, inside the single boot path every
  // caller already awaits. This guarantees that even a send() that fires
  // BEFORE the worker module is registered (e.g., an HTTP submit arriving
  // in the window between app.listen and registerXWorker) finds a valid
  // queue row and does not silently drop the job. createQueue is
  // idempotent per pg-boss docs. Also means new queues only need to be
  // added to QUEUE_NAMES — there is no second place where a createQueue
  // call can be forgotten, which is exactly how the original v10 regression
  // went unnoticed for a full release cycle.
  for (const name of Object.values(QUEUE_NAMES)) {
    await boss.createQueue(name);
  }

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'pg-boss started');

  return boss;
}

export async function stopJobQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10000 });
    boss = null;
    logger.info('pg-boss stopped');
  }
}

export const QUEUE_NAMES = {
  FORM_SUBMISSION_NOTIFICATION: 'form-submission-notification',
} as const;
