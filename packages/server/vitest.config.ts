import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Real-PostgreSQL tests have their own config (vitest.integration.config.ts)
    // and require INTEGRATION_DATABASE_URL; they must not run in the unit suite.
    exclude: ['src/__tests__/integration/**'],
    // Coverage is reporting-only (visibility), deliberately not a gate — a
    // mandatory percentage incentivizes low-value tests; risk-based route and
    // integration suites are what actually protect this codebase.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/generated/**',
        'src/types/**',
        'src/index.ts',
      ],
    },
  },
});
