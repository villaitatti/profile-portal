import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same root-.env convention as src/env.ts: one .env at the monorepo root serves
// all packages. dotenv never overrides variables already in the environment, so
// CI and Docker can still point the CLI at a database via DATABASE_URL.
const rootEnv = resolve(import.meta.dirname, '../../.env');
loadDotenv(existsSync(rootEnv) ? { path: rootEnv, quiet: true } : { quiet: true });

// Prisma's env() helper throws while the config is being loaded, which breaks
// commands that never touch the database (`prisma generate` in CI, builds on a
// fresh clone with no .env). Resolve the URL ourselves instead: commands that do
// connect will still fail loudly if the fallback points nowhere.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://portal:portal@localhost:5432/profile_portal';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
