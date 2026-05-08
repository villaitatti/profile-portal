import PgBoss from 'pg-boss';
import { env } from '../env.js';
import { logger } from './logger.js';

export const QUEUE_NAMES = {
  FORM_SUBMISSION_NOTIFICATION: 'form-submission-notification',
} as const;

// Promise-singleton pattern:
//  - `bossPromise` holds the in-flight or completed initialization. All
//    concurrent callers await the same promise, so we never construct two
//    PgBoss instances in a race between `app.listen` time requests.
//  - If initialization rejects, we clear `bossPromise` so the NEXT caller
//    can retry a fresh boot instead of receiving a broken half-initialized
//    client forever.
let bossPromise: Promise<PgBoss> | null = null;

export async function getJobQueue(): Promise<PgBoss> {
  if (bossPromise) return bossPromise;

  bossPromise = (async () => {
    const b = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      retryLimit: 3,
      retryDelay: 60,
      expireInSeconds: 24 * 60 * 60,
      archiveCompletedAfterSeconds: 7 * 24 * 60 * 60,
    });

    b.on('error', (err) => {
      logger.error({ err }, 'pg-boss error');
    });

    await b.start();

    // Create every declared queue up front, inside the single boot path every
    // caller already awaits. This guarantees that even a send() that fires
    // BEFORE the worker module is registered (e.g., an HTTP submit arriving
    // in the window between app.listen and registerXWorker) finds a valid
    // queue row and does not silently drop the job. createQueue is
    // idempotent per pg-boss docs. Also means new queues only need to be
    // added to QUEUE_NAMES — there is no second place where a createQueue
    // call can be forgotten, which is exactly how the original v10 regression
    // went unnoticed for a full release cycle.
    // Parallel: createQueue calls are independent, so awaiting them in
    // sequence would round-trip to Postgres once per queue. Promise.all
    // collapses boot-time latency to a single roundtrip window.
    await Promise.all(
      Object.values(QUEUE_NAMES).map((name) => b.createQueue(name))
    );

    logger.info({ queues: Object.values(QUEUE_NAMES) }, 'pg-boss started');

    return b;
  })().catch((err) => {
    // Failure during start() / createQueue() invalidates the cached promise
    // so a subsequent caller can attempt a fresh init (e.g., if a transient
    // DB blip caused the first attempt to fail). Without this, the promise
    // rejection would stay cached and every future caller would re-reject.
    bossPromise = null;
    throw err;
  });

  return bossPromise;
}

export async function stopJobQueue(): Promise<void> {
  // Await any in-flight init before stopping so we don't race a startup
  // that's still creating queues. If init failed, bossPromise is already
  // null so there's nothing to stop.
  if (!bossPromise) return;
  try {
    const b = await bossPromise;
    await b.stop({ graceful: true, timeout: 10000 });
    logger.info('pg-boss stopped');
  } catch (err) {
    // Swallow — a failed init is already logged by the init path above and
    // there is nothing to stop. This avoids stopJobQueue() throwing during
    // shutdown when init had rejected.
    logger.warn({ err }, 'pg-boss stop: nothing to stop (init failed)');
  } finally {
    bossPromise = null;
  }
}
