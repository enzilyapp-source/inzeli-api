import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RESET_PEARLS = 5;

function seasonYm(d = new Date()): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return y * 100 + m;
}

async function main() {
  const nowYm = seasonYm();
  console.log(
    `Resetting all pearls to ${RESET_PEARLS} (seasonYm=${nowYm}) across users and wallets...`,
  );

  const result = await prisma.$transaction(async (tx) => {
    const users = await tx.user.updateMany({
      data: {
        pearls: RESET_PEARLS,
        creditPoints: RESET_PEARLS,
        pearlsSeasonYm: nowYm,
      },
    });

    const userGameWallets = await tx.userGameWallet.updateMany({
      data: { pearls: RESET_PEARLS, seasonYm: nowYm },
    });

    const sponsorGameWallets = await tx.sponsorGameWallet.updateMany({
      data: { pearls: RESET_PEARLS, seasonYm: nowYm },
    });

    return { users, userGameWallets, sponsorGameWallets };
  });

  console.log(`✓ Users updated: ${result.users.count}`);
  console.log(`✓ User game wallets updated: ${result.userGameWallets.count}`);
  console.log(
    `✓ Sponsor game wallets updated: ${result.sponsorGameWallets.count}`,
  );
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
