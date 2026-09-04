import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';

// Graceful-shutdown contract for the sync SSE stream: an open stream (with its
// 25s heartbeat) is a permanently active request, so index.ts must be able to
// drain every stream via closeAllSseStreams() BEFORE awaiting server.close() —
// otherwise the force-exit backstop fires and skips the pg-boss drain. These
// tests pin that closeAllSseStreams ends open streams with a final event whose
// phase is 'restarting' (the agreed client contract — 'error' would make the
// web client report a failed sync for a run that may complete during
// shutdown), and that a stream which already finished normally is no longer
// in the registry.

// isDevMode: true skips the SSE-token check so the test drives the stream
// directly (the token flow is covered by the sync-token tests).
vi.mock('../../env.js', () => ({ env: { NODE_ENV: 'test' }, isDevMode: true }));
vi.mock('../../lib/logger.js', async () => (await import('../helpers/mocks.js')).loggerMock());
vi.mock('../../lib/prisma.js', async () =>
  (await import('../helpers/mocks.js')).prismaMock('syncRun', 'roleGroupMapping')
);
vi.mock('../../lib/sse-token.js', () => ({
  createSseToken: vi.fn(),
  verifySseToken: vi.fn(),
}));
vi.mock('../../services/atlassian-scim.service.js', () => ({
  isScimConfigured: vi.fn(() => true),
  getGroups: vi.fn(),
}));
vi.mock('../../services/atlassian-sync.service.js', () => ({
  runDrySync: vi.fn(),
  executeSync: vi.fn(),
  storeEmitter: vi.fn(),
  getEmitter: vi.fn(),
}));

import { syncSseRoutes, closeAllSseStreams } from '../../routes/sync-admin.routes.js';
import { prisma } from '../../lib/prisma.js';
import * as syncService from '../../services/atlassian-sync.service.js';

const mockPrisma = vi.mocked(prisma, true);
const mockSync = vi.mocked(syncService);

interface OpenStream {
  chunks: string[];
  ended: Promise<void>;
  request: http.ClientRequest;
}

let server: http.Server;

function startServer(): Promise<number> {
  const app = express();
  app.use('/api/admin/sync', syncSseRoutes);
  server = app.listen(0);
  return new Promise((resolve) =>
    server.once('listening', () => resolve((server.address() as AddressInfo).port))
  );
}

/** Opens the SSE stream and resolves once response headers have arrived. */
function openStream(port: number, runId: string): Promise<OpenStream> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      `http://127.0.0.1:${port}/api/admin/sync/runs/${runId}/stream`,
      (res) => {
        const chunks: string[] = [];
        const ended = new Promise<void>((resolveEnd) => {
          res.on('data', (c: Buffer) => chunks.push(c.toString('utf8')));
          res.on('end', resolveEnd);
        });
        resolve({ chunks, ended, request });
      }
    );
    request.on('error', reject);
  });
}

/** Lets the server-side handler run to completion after headers were flushed. */
function settle(): Promise<void> {
  return new Promise((r) => setTimeout(r, 25));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // Drain anything a failing test left open so the suite never hangs on an
  // SSE heartbeat keeping the event loop alive.
  closeAllSseStreams();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('closeAllSseStreams', () => {
  it('writes a final restarting event and ends every open stream so server.close() can resolve', async () => {
    mockPrisma.syncRun.findUnique.mockResolvedValue({ id: 'run-1', status: 'executing' } as never);
    mockSync.getEmitter.mockReturnValue(new EventEmitter());

    const port = await startServer();
    const stream = await openStream(port, 'run-1');
    await settle();

    closeAllSseStreams();
    await stream.ended;

    const body = stream.chunks.join('');
    expect(body).toContain('"phase":"restarting"');
    expect(body).toContain('server is restarting');
    // 'error' is what the web client maps to a failed run — the shutdown
    // event must never carry it.
    expect(body).not.toContain('"phase":"error"');
  });

  it('drains multiple concurrent streams in one call', async () => {
    mockPrisma.syncRun.findUnique.mockResolvedValue({ id: 'run-1', status: 'executing' } as never);
    mockSync.getEmitter.mockReturnValue(new EventEmitter());

    const port = await startServer();
    const first = await openStream(port, 'run-1');
    const second = await openStream(port, 'run-1');
    await settle();

    closeAllSseStreams();
    await Promise.all([first.ended, second.ended]);

    expect(first.chunks.join('')).toContain('"phase":"restarting"');
    expect(second.chunks.join('')).toContain('"phase":"restarting"');
  });

  it('a stream that already finished via a done event is out of the registry', async () => {
    const emitter = new EventEmitter();
    mockPrisma.syncRun.findUnique.mockResolvedValue({ id: 'run-1', status: 'executing' } as never);
    mockSync.getEmitter.mockReturnValue(emitter);

    const port = await startServer();
    const stream = await openStream(port, 'run-1');
    await settle();

    emitter.emit('progress', {
      phase: 'done',
      step: 1,
      totalSteps: 1,
      percentage: 100,
      description: 'Execution completed',
    });
    await stream.ended;

    // Shutdown after normal completion must not write to the finished
    // response — the connection's closer was removed by its own cleanup.
    closeAllSseStreams();

    const body = stream.chunks.join('');
    expect(body).toContain('"phase":"done"');
    expect(body).not.toContain('"phase":"restarting"');
  });
});
