import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedDemoShop } from '../src/services/seedService.js';

export { seedDemoShop };

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isMain) {
  const prisma = new PrismaClient();
  seedDemoShop(prisma)
    .then((res) => {
      console.log(`Seed complete: shopId=${res.shopId}, created=${res.seeded}`);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
