import { PrismaClient } from '@prisma/client';
import { awardBadgesForBalance, badgeContext } from '../src/common/badges';

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

  const result = await prisma.$transaction(
    async (tx) => {
      const earnedAt = new Date();
      let badgeAwards = 0;

      const userGameBadgeWallets = await tx.userGameWallet.findMany({
        where: { pearls: { gt: RESET_PEARLS } },
        select: { userId: true, gameId: true, pearls: true, seasonYm: true },
      });
      for (const wallet of userGameBadgeWallets) {
        badgeAwards += await awardBadgesForBalance(tx, {
          userId: wallet.userId,
          balance: wallet.pearls,
          seasonYm: wallet.seasonYm ?? nowYm,
          earnedAt,
          context: badgeContext({ gameId: wallet.gameId }),
        });
      }

      const sponsorGameBadgeWallets = await tx.sponsorGameWallet.findMany({
        where: { pearls: { gt: RESET_PEARLS } },
        select: {
          userId: true,
          sponsorCode: true,
          gameId: true,
          pearls: true,
          seasonYm: true,
        },
      });
      for (const wallet of sponsorGameBadgeWallets) {
        badgeAwards += await awardBadgesForBalance(tx, {
          userId: wallet.userId,
          balance: wallet.pearls,
          seasonYm: wallet.seasonYm ?? nowYm,
          earnedAt,
          context: badgeContext({
            gameId: wallet.gameId,
            sponsorCode: wallet.sponsorCode,
          }),
        });
      }

      const dewanyahGameBadgeWallets = await tx.dewanyahGameWallet.findMany({
        where: { pearls: { gt: RESET_PEARLS } },
        select: {
          userId: true,
          dewanyahId: true,
          gameId: true,
          pearls: true,
          seasonYm: true,
        },
      });
      for (const wallet of dewanyahGameBadgeWallets) {
        badgeAwards += await awardBadgesForBalance(tx, {
          userId: wallet.userId,
          balance: wallet.pearls,
          seasonYm: wallet.seasonYm ?? nowYm,
          earnedAt,
          context: badgeContext({
            gameId: wallet.gameId,
            dewanyahId: wallet.dewanyahId,
          }),
        });
      }

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

      const dewanyahGameWallets = await tx.dewanyahGameWallet.updateMany({
        data: { pearls: RESET_PEARLS, seasonYm: nowYm },
      });

      return {
        users,
        userGameWallets,
        sponsorGameWallets,
        dewanyahGameWallets,
        badgeAwards,
      };
    },
    { timeout: 60_000 },
  );

  console.log(`✓ Users updated: ${result.users.count}`);
  console.log(`✓ User game wallets updated: ${result.userGameWallets.count}`);
  console.log(
    `✓ Sponsor game wallets updated: ${result.sponsorGameWallets.count}`,
  );
  console.log(
    `✓ Dewanyah game wallets updated: ${result.dewanyahGameWallets.count}`,
  );
  console.log(`✓ Badge awards snapshotted: ${result.badgeAwards}`);
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
