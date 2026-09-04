import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root BEFORE any other imports
config({ path: resolve(import.meta.dirname, '../../../.env') });

// Now import everything else
const { env } = await import('./env.js');
const { logger } = await import('./lib/logger.js');
const { default: app } = await import('./app.js');
const { stopJobQueue } = await import('./lib/job-queue.js');
const { prisma } = await import('./lib/prisma.js');

logger.info({ mode: env.NODE_ENV }, 'Starting server');

// Register automation cron jobs (July 1 + July 2 at 04:00 UTC)
const { registerCronJobs, checkMissedJulyAutomations } = await import(
  './services/automation.service.js'
);
registerCronJobs();

// Missed-fire detection: if the container was down at a July fire time (or a
// run died mid-execution), the annual automation silently never happens and
// node-cron will not replay it for a year. Deliberately NOT awaited — the
// check must never delay listen — and checkMissedJulyAutomations never throws
// (failures are logged inside; an alert failure only logs).
void checkMissedJulyAutomations();

// Prune uploads/trash/ entries past the 7-day retention (deferred image
// deletion, see image-upload.service.ts). Runs at boot as well as on the daily
// cron tick because that cron is gated behind APPOINTEE_EMAIL_CRON_ENABLED.
// Never throws; deliberately not awaited — must not delay listen.
const { pruneTrashedImages } = await import('./services/image-upload.service.js');
void pruneTrashedImages();

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

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server running');
});

// --- Graceful shutdown ---
//
// Every `docker stop` / deploy sends SIGTERM to this process (via docker-init,
// which the compose files enable with `init: true`). Without a handler the
// process is killed outright once the grace period expires: in-flight responses
// are severed, and a pg-boss job killed mid-handler stays `active` until
// `expireInSeconds` (23h) elapses before it is retried.
//
// SHUTDOWN_TIMEOUT_MS below is deliberately just under the compose
// `stop_grace_period` (30s) — raising one without the other means Docker kills
// us mid-drain and the shutdown log never lands.
//
// Order matters. Stop accepting new connections first, then drain pg-boss so a
// running job can finish and ack, then release the Postgres pool last because
// both of the previous steps need it.
const SHUTDOWN_TIMEOUT_MS = 25_000;

// Budget for in-flight Atlassian sync tasks during shutdown. Arithmetic: this
// 8s + server.close() + the 10s pg-boss stop + prisma disconnect must all fit
// under the 25s SHUTDOWN_TIMEOUT_MS backstop, leaving ~7s of slack.
const SYNC_DRAIN_BUDGET_MS = 8_000;
let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress — ignoring signal');
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown initiated');

  // Backstop: if any drain step wedges, exit anyway rather than waiting for
  // Docker's SIGKILL, which would give us no shutdown log at all.
  const forceExit = setTimeout(() => {
    logger.error({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Shutdown timed out — forcing exit');
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Give in-flight Atlassian sync tasks a bounded window to finish BEFORE
    // draining the SSE streams: runDrySync/executeSync run as detached tasks,
    // so nothing else stops process.exit() from killing an execution after
    // partial SCIM mutations (its run row then waits on the 30-min lease). A
    // sync that finishes in budget emits 'done' to its still-open SSE stream,
    // whose cleanup deregisters it — only genuinely unfinished runs get the
    // 'restarting' event from closeAllSseStreams. awaitActiveSyncs never throws.
    const { awaitActiveSyncs } = await import('./services/atlassian-sync.service.js');
    await awaitActiveSyncs(SYNC_DRAIN_BUDGET_MS);

    // Drain SSE streams BEFORE waiting on server.close(): an open SSE response
    // (with its 25s heartbeat) counts as an active request forever, so close()
    // would never resolve and the force-exit backstop would skip stopJobQueue,
    // stranding in-flight pg-boss jobs as 'active' for up to 23h.
    // closeAllSseStreams never throws.
    const { closeAllSseStreams } = await import('./routes/sync-admin.routes.js');
    closeAllSseStreams();

    await new Promise<void>((res) => {
      server.close(() => res());
    });
    logger.info('HTTP server closed');

    await stopJobQueue();
    await prisma.$disconnect();
    logger.info('Shutdown complete');
  } catch (err) {
    logger.error({ err, signal }, 'Error during shutdown');
    exitCode = exitCode || 1;
  }

  clearTimeout(forceExit);
  process.exit(exitCode);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// --- Process-level crash safety ---
//
// Safety net for floating promises anywhere in the process — fire-and-forget
// calls in cron jobs, workers, or SSE plumbing that reject outside a request
// context (Express 5 catches async route handlers, but only those). Node's
// default for an unhandled rejection is to terminate; for a web server that
// turns one transient upstream error into a full outage. Log loudly (so
// monitoring can alert on it) and stay up — the affected request is already
// lost either way, but every other user's session survives.
process.on('unhandledRejection', (reason) => {
  logger.error(
    { err: reason instanceof Error ? reason : new Error(String(reason)) },
    'Unhandled promise rejection — process kept alive, investigate immediately'
  );
});

// An uncaught exception, unlike a rejection, can leave module state torn
// halfway through a mutation. Drain and exit so Docker restarts us clean.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  void shutdown('uncaughtException', 1);
});
