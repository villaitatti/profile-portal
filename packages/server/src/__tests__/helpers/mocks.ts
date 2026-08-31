import { vi } from 'vitest';

/**
 * Shared test doubles for the three modules every server test stubs.
 *
 * Usage — vi.mock factories are hoisted, so import these lazily inside the
 * factory:
 *
 *   vi.mock('../../lib/logger.js', async () =>
 *     (await import('../helpers/mocks.js')).loggerMock());
 *   vi.mock('../../env.js', async () =>
 *     (await import('../helpers/mocks.js')).envMock({ NODE_ENV: 'test' }));
 *   vi.mock('../../lib/prisma.js', async () =>
 *     (await import('../helpers/mocks.js')).prismaMock('appointeeEmailEvent'));
 *
 * New tests should use these instead of hand-rolling the same objects; the
 * pre-existing per-file copies migrate opportunistically as files are touched.
 */

/** Module shape for vi.mock('../../lib/logger.js'). */
export function loggerMock() {
  return {
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  };
}

/** Module shape for vi.mock('../../env.js') with overridable values. */
export function envMock(overrides: Record<string, unknown> = {}) {
  return {
    env: { NODE_ENV: 'test', ...overrides },
    isDevMode: false,
  };
}

const PRISMA_DELEGATE_METHODS = [
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

type PrismaDelegateStub = Record<(typeof PRISMA_DELEGATE_METHODS)[number], ReturnType<typeof vi.fn>>;

function delegateStub(): PrismaDelegateStub {
  return Object.fromEntries(
    PRISMA_DELEGATE_METHODS.map((m) => [m, vi.fn()])
  ) as PrismaDelegateStub;
}

/**
 * Module shape for vi.mock('../../lib/prisma.js'): one full delegate stub per
 * named model, plus $transaction that runs its callback against the stub.
 */
export function prismaMock(...models: string[]) {
  const prisma: Record<string, unknown> = Object.fromEntries(
    models.map((m) => [m, delegateStub()])
  );
  prisma.$transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') return arg(prisma);
    return Promise.all(arg as Promise<unknown>[]);
  });
  return { prisma };
}
