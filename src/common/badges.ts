// src/common/badges.ts
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type TxLike = PrismaService | Prisma.TransactionClient;

export const BADGE_MILESTONES = [
  { threshold: 5, label: 'عليمي' },
  { threshold: 10, label: 'يمشي حاله' },
  { threshold: 15, label: 'زين' },
  { threshold: 20, label: 'فنان' },
  { threshold: 30, label: 'فلتة' },
] as const;

export type BadgeScope = $Enums.BadgeScope;

export type BadgeContext = {
  scope: BadgeScope;
  contextKey: string;
  gameId: string;
  sponsorCode?: string | null;
  dewanyahId?: string | null;
};

export function seasonYm(d = new Date()): number {
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

export function seasonRange(ym: number): { gte: Date; lt: Date } {
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  return {
    gte: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
  };
}

export function badgeContext(params: {
  gameId: string;
  sponsorCode?: string | null;
  dewanyahId?: string | null;
}): BadgeContext {
  const gameId = params.gameId;
  const sponsorCode = params.sponsorCode?.trim() || null;
  const dewanyahId = params.dewanyahId?.trim() || null;

  if (dewanyahId) {
    return {
      scope: 'DEWANYAH',
      contextKey: `DEWANYAH:${dewanyahId}:${gameId}`,
      gameId,
      sponsorCode: null,
      dewanyahId,
    };
  }

  if (sponsorCode) {
    return {
      scope: 'SPONSOR',
      contextKey: `SPONSOR:${sponsorCode}:${gameId}`,
      gameId,
      sponsorCode,
      dewanyahId: null,
    };
  }

  return {
    scope: 'GENERAL',
    contextKey: `GENERAL:${gameId}`,
    gameId,
    sponsorCode: null,
    dewanyahId: null,
  };
}

export async function awardUserBadge(
  tx: TxLike,
  params: {
    userId: string;
    threshold: number;
    seasonYm: number;
    earnedAt: Date;
    context: BadgeContext;
  },
): Promise<boolean> {
  const milestone = BADGE_MILESTONES.find(
    (m) => m.threshold === params.threshold,
  );
  if (!milestone) return false;

  const client = tx as any;
  const data = {
    userId: params.userId,
    label: milestone.label,
    threshold: milestone.threshold,
    scope: params.context.scope,
    contextKey: params.context.contextKey,
    gameId: params.context.gameId,
    sponsorCode: params.context.sponsorCode ?? null,
    dewanyahId: params.context.dewanyahId ?? null,
  };

  const existing = await client.userBadgeAward.findUnique({
    where: {
      userId_scope_contextKey_label_seasonYm: {
        userId: data.userId,
        scope: data.scope,
        contextKey: data.contextKey,
        label: data.label,
        seasonYm: params.seasonYm,
      },
    },
    select: { id: true },
  });
  if (existing) return false;

  await client.userBadgeAward.create({
    data: {
      ...data,
      seasonYm: params.seasonYm,
      earnedAt: params.earnedAt,
    },
  });

  await client.userBadge.upsert({
    where: {
      userId_scope_contextKey_label: {
        userId: data.userId,
        scope: data.scope,
        contextKey: data.contextKey,
        label: data.label,
      },
    },
    update: {
      count: { increment: 1 },
      lastEarnedAt: params.earnedAt,
    },
    create: {
      ...data,
      count: 1,
      firstEarnedAt: params.earnedAt,
      lastEarnedAt: params.earnedAt,
    },
  });

  return true;
}

export async function awardBadgesForBalance(
  tx: TxLike,
  params: {
    userId: string;
    balance: number;
    seasonYm: number;
    earnedAt: Date;
    context: BadgeContext;
  },
): Promise<number> {
  let awarded = 0;
  for (const milestone of BADGE_MILESTONES) {
    if (params.balance < milestone.threshold) continue;
    if (
      await awardUserBadge(tx, {
        userId: params.userId,
        threshold: milestone.threshold,
        seasonYm: params.seasonYm,
        earnedAt: params.earnedAt,
        context: params.context,
      })
    ) {
      awarded += 1;
    }
  }
  return awarded;
}

export async function badgeSnapshot(tx: TxLike, userId: string) {
  const client = tx as any;
  const rows = await client.userBadge.findMany({
    where: { userId },
    orderBy: [{ threshold: 'asc' }, { lastEarnedAt: 'desc' }],
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.label] = (counts[row.label] ?? 0) + (row.count ?? 0);
  }

  const best = rows.reduce((acc: any | null, row: any) => {
    if (!acc) return row;
    if ((row.threshold ?? 0) > (acc.threshold ?? 0)) return row;
    if (
      (row.threshold ?? 0) === (acc.threshold ?? 0) &&
      new Date(row.lastEarnedAt).getTime() >
        new Date(acc.lastEarnedAt).getTime()
    ) {
      return row;
    }
    return acc;
  }, null);

  return {
    badges: rows,
    badgeCounts: counts,
    bestBadge: best,
  };
}
