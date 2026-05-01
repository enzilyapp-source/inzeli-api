import { PrismaClient } from '@prisma/client';
import {
  awardBadgesForBalance,
  badgeContext,
  seasonYm,
} from '../src/common/badges';

const prisma = new PrismaClient();
const STARTING_PEARLS = 5;

type Context = ReturnType<typeof badgeContext>;

function balanceKey(userId: string, context: Context, ym: number): string {
  return `${userId}|${context.scope}|${context.contextKey}|${ym}`;
}

async function main() {
  const matches = await prisma.match.findMany({
    where: { roomCode: { not: null } },
    orderBy: { createdAt: 'asc' },
    include: {
      room: { select: { sponsorCode: true, dewanyahId: true } },
      parts: { select: { userId: true, outcome: true } },
    },
  });

  const balances = new Map<string, number>();
  let awardsCreated = 0;
  let matchesReplayed = 0;

  for (const match of matches) {
    const winners = match.parts
      .filter((p) => p.outcome === 'WIN')
      .map((p) => p.userId);
    const losers = match.parts
      .filter((p) => p.outcome === 'LOSS')
      .map((p) => p.userId);
    if (!winners.length && !losers.length) continue;

    const context = badgeContext({
      gameId: match.gameId,
      sponsorCode: match.sponsorCode ?? match.room?.sponsorCode ?? null,
      dewanyahId: match.room?.dewanyahId ?? null,
    });
    const ym = seasonYm(match.createdAt);
    const participants = Array.from(new Set([...winners, ...losers]));

    const getBalance = (userId: string) => {
      const key = balanceKey(userId, context, ym);
      if (!balances.has(key)) balances.set(key, STARTING_PEARLS);
      return balances.get(key) ?? STARTING_PEARLS;
    };

    const setBalance = (userId: string, value: number) => {
      balances.set(balanceKey(userId, context, ym), value);
    };

    for (const userId of participants) {
      awardsCreated += await awardBadgesForBalance(prisma, {
        userId,
        balance: getBalance(userId),
        seasonYm: ym,
        earnedAt: match.createdAt,
        context,
      });
    }

    let pot = 0;
    for (const loser of losers) {
      const current = getBalance(loser);
      if (current > 0) {
        setBalance(loser, current - 1);
        pot += 1;
      }
    }

    if (pot > 0 && winners.length > 0) {
      const perWinner = Math.floor(pot / winners.length);
      const remainder = pot % winners.length;
      for (let i = 0; i < winners.length; i += 1) {
        const increment = perWinner + (i === 0 ? remainder : 0);
        if (increment <= 0) continue;
        setBalance(winners[i], getBalance(winners[i]) + increment);
      }
    }

    for (const winner of winners) {
      awardsCreated += await awardBadgesForBalance(prisma, {
        userId: winner,
        balance: getBalance(winner),
        seasonYm: ym,
        earnedAt: match.createdAt,
        context,
      });
    }

    matchesReplayed += 1;
  }

  const [badgeRows, awardRows] = await Promise.all([
    prisma.userBadge.count(),
    prisma.userBadgeAward.count(),
  ]);

  console.log(`✓ Matches replayed: ${matchesReplayed}`);
  console.log(`✓ Badge awards created: ${awardsCreated}`);
  console.log(`✓ UserBadge rows total: ${badgeRows}`);
  console.log(`✓ UserBadgeAward rows total: ${awardRows}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
