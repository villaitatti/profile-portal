import { execSync } from 'node:child_process';

/**
 * Applies every migration to the disposable integration database, from
 * scratch. `migrate reset` (not `migrate deploy`) so each run ALSO proves the
 * full chain applies to an empty database — the same guarantee the CI
 * migration check provides before deployment.
 */
export default function setup() {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (!url) {
    throw new Error(
      'INTEGRATION_DATABASE_URL is not set. Point it at a disposable PostgreSQL ' +
        'database (it will be wiped), e.g. postgresql://portal:portal@localhost:5432/portal_test'
    );
  }
  execSync('npx prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
