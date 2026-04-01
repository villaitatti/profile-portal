import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
        requiredRoles: ['fellows', 'fellows-current', 'staff-it'],
        sortOrder: 1,
      },
      {
        name: 'Digital Collections',
        description: 'Access digitized materials and archives',
        url: 'https://digital.itatti.harvard.edu',
        loginMethod: 'harvard-key',
        requiredRoles: ['fellows', 'fellows-current', 'staff-it'],
        sortOrder: 2,
      },
      {
        name: 'IT Admin Console',
        description: 'IT administration tools',
        url: 'https://admin.itatti.harvard.edu',
        loginMethod: 'vit-id',
        requiredRoles: ['staff-it'],
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
