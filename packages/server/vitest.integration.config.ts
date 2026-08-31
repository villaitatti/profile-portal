import { defineConfig } from 'vitest/config';

// Disposable-PostgreSQL integration suite. Requires INTEGRATION_DATABASE_URL
// pointing at a database that MAY BE WIPED (globalSetup applies all migrations
// from scratch). Locally: `docker compose -f docker-compose.dev.yml up -d
// postgres` then `pnpm --filter @itatti/server test:integration`. In CI the
// postgres service container provides it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    globalSetup: ['src/__tests__/integration/global-setup.ts'],
    // Concurrency tests race real transactions; keep one worker so pool
    // exhaustion never masquerades as a lost race.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
