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
  logger.info('pg-boss started');

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
