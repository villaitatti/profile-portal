import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { KnownRoles } from '@itatti/shared';

// Standalone script: the Prisma 7 client requires a driver adapter (the
// schema no longer carries env("DATABASE_URL")), so load the root .env the
// same way prisma.config.ts does and hand the URL to the adapter.
const rootEnv = resolve(import.meta.dirname, '../../../.env');
loadDotenv(existsSync(rootEnv) ? { path: rootEnv, quiet: true } : { quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

async function main() {
  const count = await prisma.application.count();
  if (count > 0) {
    console.log('Database already has data, skipping seed.');
    return;
  }

  console.log('Seeding database...');

  await prisma.application.createMany({
    data: [
      {
        name: 'Library Catalog',
        description: 'Search the I Tatti library collection',
        url: 'https://library.itatti.harvard.edu',
        loginMethod: 'vit-id',
        requiredRoles: ['fellows', 'fellows-current', KnownRoles.STAFF_IT],
        sortOrder: 1,
      },
      {
        name: 'Digital Collections',
        description: 'Access digitized materials and archives',
        url: 'https://digital.itatti.harvard.edu',
        loginMethod: 'harvard-key',
        requiredRoles: ['fellows', 'fellows-current', KnownRoles.STAFF_IT],
        sortOrder: 2,
      },
      {
        name: 'I Tatti Website',
        description: 'The public website of Villa I Tatti — The Harvard University Center for Italian Renaissance Studies.',
        url: 'https://itatti.harvard.edu',
        loginMethod: 'none',
        requiredRoles: ['fellows', 'fellows-current', KnownRoles.STAFF_IT],
        sortOrder: 3,
      },
      {
        name: 'IT Admin Console',
        description: 'IT administration tools',
        url: 'https://admin.itatti.harvard.edu',
        loginMethod: 'vit-id',
        requiredRoles: [KnownRoles.STAFF_IT],
        sortOrder: 10,
      },
    ],
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
