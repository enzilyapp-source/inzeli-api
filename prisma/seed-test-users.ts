import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD || 'Test@123456';

const TEST_ACCOUNTS = [
  {
    email: 'review@enzily.app',
    displayName: 'Apple Review',
    phone: '+96550000001',
  },
  {
    email: 'test1@test.com',
    displayName: 'Test One',
    phone: '+96550000002',
  },
  {
    email: 'test2@test.com',
    displayName: 'Test Two',
    phone: '+96550000003',
  },
  {
    email: 'test3@test.com',
    displayName: 'Test Three',
    phone: '+96550000004',
  },
  {
    email: 'test4@test.com',
    displayName: 'Test Four',
    phone: '+96550000005',
  },
];

async function main() {
  console.log(`Seeding ${TEST_ACCOUNTS.length} test accounts...`);

  for (const account of TEST_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    await prisma.user.upsert({
      where: { email: account.email.toLowerCase() },
      update: {
        displayName: account.displayName,
        phone: account.phone,
        isTestAccount: true,
        phoneVerifiedAt: new Date(),
        passwordHash,
      },
      create: {
        email: account.email.toLowerCase(),
        displayName: account.displayName,
        phone: account.phone,
        isTestAccount: true,
        phoneVerifiedAt: new Date(),
        passwordHash,
      },
    });

    console.log(`✓ ${account.email}`);
  }

  console.log('Done.');
  console.log(`Default password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
