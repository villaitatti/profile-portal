import { execSync } from 'node:child_process';

/**
 * Resets the disposable integration database to empty and applies every
 * migration from scratch — the same guarantee the CI migration check gives
 * before deployment.
 *
 * Deliberately NOT `prisma migrate reset`: Prisma 7 removed `--skip-seed`,
 * and with `migrations.seed` configured in prisma.config.ts a reset would
 * run the dev seed. The integration contract is "empty schema + full
 * migration chain, no data", so we drop the schema and `migrate deploy`.
 * Both commands read their datasource from prisma.config.ts, which resolves
 * DATABASE_URL from the environment injected below.
 */
export default function setup() {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (!url) {
    throw new Error(
      'INTEGRATION_DATABASE_URL is not set. Point it at a disposable PostgreSQL ' +
        'database (it will be wiped), e.g. postgresql://portal:portal@localhost:5432/portal_test'
    );
  }
  const env = { ...process.env, DATABASE_URL: url };

  execSync('npx prisma db execute --stdin', {
    input: 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    stdio: ['pipe', 'inherit', 'inherit'],
    env,
  });
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
}
