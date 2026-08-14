// src/common/pearls.ts
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type TxLike = PrismaService | Prisma.TransactionClient;

const SEASON_START_PEARLS = 5;
const SEASON_START_BADGE_SCORE = 5;
const BADGE_LOSS_BUFFER = 3;
const DEFAULT_GAMES = [
  'كوت',
  'بلوت',
  'تريكس',
  'هند',
  'سبيتة',
  'اونو',
  'دفان',
  'شطرنج',
  'دامه',
  'كيرم',
  'دومنه',
  'طاولة',
  'جاكارو',
  'بيبيفوت',
  'قدم',
  'سله',
  'طائره',
  'بولنج',
  'بادل',
  'تنس طاولة',
  'تنس أرضي',
  'بلياردو',
];

function seasonYm(d = new Date()): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return y * 100 + m; // YYYYMM
}

export function isBadgeLossBufferEnabled(): boolean {
  const raw =
    [
      process.env.BADGE_LOSS_BUFFER_ENABLED,
      process.env.BADGE_PROGRESS_MODE,
    ].find((value) => value?.trim()) ?? '';
  const value = raw.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'buffered'].includes(value);
}

// ---------- helpers ----------
async function ensureDefaultGames(tx: TxLike) {
  const client = tx as any;
  await Promise.all(
    DEFAULT_GAMES.map((id) =>
      client.game.upsert({
        where: { id },
        update: {},
        create: { id, name: id, category: 'عام' },
      }),
    ),
  );
}

async function listGameIds(tx: TxLike): Promise<string[]> {
  const client = tx as any;
  // make sure the base catalog exists (cheap idempotent upserts)
  await ensureDefaultGames(tx);
  const games = await client.game.findMany({ select: { id: true } });
  return games.map((g: any) => g.id);
}

async function ensureUserGameWallet(
  tx: TxLike,
  userId: string,
  gameId: string,
): Promise<number> {
  const client = tx as any;
  const nowYm = seasonYm();

  const w = await client.userGameWallet.upsert({
    where: { userId_gameId: { userId, gameId } },
    update: {} as any,
    create: {
      userId,
      gameId,
      pearls: SEASON_START_PEARLS,
      badgeScore: SEASON_START_BADGE_SCORE,
      badgeLossCount: 0,
      seasonYm: nowYm,
    } as any,
    select: {
      pearls: true,
      badgeScore: true,
      badgeLossCount: true,
      seasonYm: true,
    } as any,
  });

  const currentYm = (w?.seasonYm ?? 0) as number;
  if (currentYm !== nowYm) {
    const updated = await client.userGameWallet.update({
      where: { userId_gameId: { userId, gameId } },
      data: {
        pearls: SEASON_START_PEARLS,
        badgeScore: SEASON_START_BADGE_SCORE,
        badgeLossCount: 0,
        seasonYm: nowYm,
      } as any,
      select: { pearls: true } as any,
    });
    return (updated?.pearls ?? 0) as number;
  }

  return (w?.pearls ?? 0) as number;
}

export async function ensureAllGameWallets(tx: TxLike, userId: string) {
  const balances: Record<string, number> = {};
  const ids = await listGameIds(tx);
  for (const gameId of ids) {
    balances[gameId] = await ensureUserGameWallet(tx, userId, gameId);
  }
  return balances;
}

export async function ensureAllGameBadgeScores(tx: TxLike, userId: string) {
  const scores: Record<string, number> = {};
  const ids = await listGameIds(tx);
  for (const gameId of ids) {
    scores[gameId] = await getGameBadgeScore(tx, userId, gameId);
  }
  return scores;
}

// -------------------- REGULAR (User per-game pearls) --------------------
export async function getGamePearls(
  tx: TxLike,
  userId: string,
  gameId: string,
): Promise<number> {
  return ensureUserGameWallet(tx, userId, gameId);
}

export async function getGameBadgeScore(
  tx: TxLike,
  userId: string,
  gameId: string,
): Promise<number> {
  const client = tx as any;
  const pearls = await ensureUserGameWallet(tx, userId, gameId);
  if (!isBadgeLossBufferEnabled()) return pearls;
  const wallet = await client.userGameWallet.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { badgeScore: true },
  });
  return (wallet?.badgeScore ?? SEASON_START_BADGE_SCORE) as number;
}

export async function recordGameBadgeWin(
  tx: TxLike,
  userId: string,
  gameId: string,
  amount = 1,
): Promise<number> {
  if (!isBadgeLossBufferEnabled()) return getGameBadgeScore(tx, userId, gameId);
  if (amount <= 0) return getGameBadgeScore(tx, userId, gameId);
  const client = tx as any;
  const nowYm = seasonYm();
  await ensureUserGameWallet(tx, userId, gameId);
  const updated = await client.userGameWallet.update({
    where: { userId_gameId: { userId, gameId } },
    data: {
      badgeScore: { increment: amount },
      badgeLossCount: 0,
      seasonYm: nowYm,
    } as any,
    select: { badgeScore: true },
  });
  return (updated?.badgeScore ?? SEASON_START_BADGE_SCORE) as number;
}

export async function recordGameBadgeLoss(
  tx: TxLike,
  userId: string,
  gameId: string,
): Promise<number> {
  if (!isBadgeLossBufferEnabled()) return getGameBadgeScore(tx, userId, gameId);
  const client = tx as any;
  const nowYm = seasonYm();
  await ensureUserGameWallet(tx, userId, gameId);
  const wallet = await client.userGameWallet.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { badgeScore: true, badgeLossCount: true },
  });
  const currentScore = (wallet?.badgeScore ??
    SEASON_START_BADGE_SCORE) as number;
  const nextLossCount = ((wallet?.badgeLossCount ?? 0) as number) + 1;
  const shouldDrop = nextLossCount >= BADGE_LOSS_BUFFER;
  const nextScore = Math.max(0, currentScore - (shouldDrop ? 1 : 0));
  const updated = await client.userGameWallet.update({
    where: { userId_gameId: { userId, gameId } },
    data: {
      badgeScore: nextScore,
      badgeLossCount: shouldDrop ? 0 : nextLossCount,
      seasonYm: nowYm,
    } as any,
    select: { badgeScore: true },
  });
  return (updated?.badgeScore ?? nextScore) as number;
}

// Legacy accessor kept for compatibility with older callers:
// returns the highest per-game balance after ensuring monthly wallets.
export async function getPearls(tx: TxLike, userId: string): Promise<number> {
  const balances = await ensureAllGameWallets(tx, userId);
  const vals = Object.values(balances);
  if (!vals.length) return 0;
  return Math.max(...vals);
}

export async function incGamePearls(
  tx: TxLike,
  userId: string,
  gameId: string,
  amount = 1,
): Promise<void> {
  if (amount <= 0) return;
  const client = tx as any;
  const nowYm = seasonYm();

  // ensure season reset first
  const current = await ensureUserGameWallet(tx, userId, gameId);

  const data: any = { pearls: { increment: amount }, seasonYm: nowYm };
  if (!isBadgeLossBufferEnabled()) {
    data.badgeScore = current + amount;
    data.badgeLossCount = 0;
  }
  await client.userGameWallet.update({
    where: { userId_gameId: { userId, gameId } },
    data,
  });
}

export async function decGamePearls(
  tx: TxLike,
  userId: string,
  gameId: string,
  amount = 1,
): Promise<void> {
  if (amount <= 0) return;
  const client = tx as any;
  const nowYm = seasonYm();

  const current = await ensureUserGameWallet(tx, userId, gameId);
  if (current < amount) throw new Error('NOT_ENOUGH_PEARLS');

  const data: any = { pearls: { decrement: amount }, seasonYm: nowYm };
  if (!isBadgeLossBufferEnabled()) {
    data.badgeScore = current - amount;
    data.badgeLossCount = 0;
  }
  await client.userGameWallet.update({
    where: { userId_gameId: { userId, gameId } },
    data,
  });
}

// Graceful "stake if you can, otherwise zero" helper for room creation/join
export async function takeGamePearlsOrZero(
  tx: TxLike,
  userId: string,
  gameId: string,
  amount = 1,
): Promise<{ charged: number; remaining: number }> {
  const current = await getGamePearls(tx, userId, gameId);
  const charged = Math.min(current, amount);
  if (charged > 0) {
    await decGamePearls(tx, userId, gameId, charged);
  }
  return { charged, remaining: current - charged };
}

// -------------------- SPONSOR (SponsorGameWallet.pearls) --------------------
export async function getSponsorPearls(
  tx: TxLike,
  userId: string,
  sponsorCode: string,
  gameId: string,
): Promise<number> {
  const client = tx as any;
  const nowYm = seasonYm();

  // ensure wallet exists
  const w = await client.sponsorGameWallet.upsert({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    update: {} as any,
    create: {
      userId,
      sponsorCode,
      gameId,
      pearls: SEASON_START_PEARLS,
      badgeScore: SEASON_START_BADGE_SCORE,
      badgeLossCount: 0,
      seasonYm: nowYm,
    } as any,
    select: {
      pearls: true,
      badgeScore: true,
      badgeLossCount: true,
      seasonYm: true,
    } as any,
  });

  const currentYm = (w?.seasonYm ?? 0) as number;
  if (currentYm !== nowYm) {
    const updated = await client.sponsorGameWallet.update({
      where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
      data: {
        pearls: SEASON_START_PEARLS,
        badgeScore: SEASON_START_BADGE_SCORE,
        badgeLossCount: 0,
        seasonYm: nowYm,
      } as any,
      select: { pearls: true } as any,
    });
    return (updated?.pearls ?? 0) as number;
  }

  return (w?.pearls ?? 0) as number;
}

export async function incSponsorPearls(
  tx: TxLike,
  userId: string,
  sponsorCode: string,
  gameId: string,
  amount = 1,
) {
  if (amount <= 0) return;
  const client = tx as any;
  const nowYm = seasonYm();

  // ensure season reset first
  const current = await getSponsorPearls(tx, userId, sponsorCode, gameId);

  const data: any = { pearls: { increment: amount }, seasonYm: nowYm };
  if (!isBadgeLossBufferEnabled()) {
    data.badgeScore = current + amount;
    data.badgeLossCount = 0;
  }
  await client.sponsorGameWallet.update({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    data,
  });
}

export async function getSponsorBadgeScore(
  tx: TxLike,
  userId: string,
  sponsorCode: string,
  gameId: string,
): Promise<number> {
  const client = tx as any;
  const pearls = await getSponsorPearls(tx, userId, sponsorCode, gameId);
  if (!isBadgeLossBufferEnabled()) return pearls;
  const wallet = await client.sponsorGameWallet.findUnique({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    select: { badgeScore: true },
  });
  return (wallet?.badgeScore ?? SEASON_START_BADGE_SCORE) as number;
}

export async function recordSponsorBadgeWin(
  tx: TxLike,
  userId: string,
  sponsorCode: string,
  gameId: string,
  amount = 1,
): Promise<number> {
  if (!isBadgeLossBufferEnabled()) {
    return getSponsorBadgeScore(tx, userId, sponsorCode, gameId);
  }
  if (amount <= 0) return getSponsorBadgeScore(tx, userId, sponsorCode, gameId);
  const client = tx as any;
  const nowYm = seasonYm();
  await getSponsorPearls(tx, userId, sponsorCode, gameId);
  const updated = await client.sponsorGameWallet.update({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    data: {
      badgeScore: { increment: amount },
      badgeLossCount: 0,
      seasonYm: nowYm,
    } as any,
    select: { badgeScore: true },
  });
  return (updated?.badgeScore ?? SEASON_START_BADGE_SCORE) as number;
}

export async function recordSponsorBadgeLoss(
  tx: TxLike,
  userId: string,
  sponsorCode: string,
  gameId: string,
): Promise<number> {
  if (!isBadgeLossBufferEnabled()) {
    return getSponsorBadgeScore(tx, userId, sponsorCode, gameId);
  }
  const client = tx as any;
  const nowYm = seasonYm();
  await getSponsorPearls(tx, userId, sponsorCode, gameId);
  const wallet = await client.sponsorGameWallet.findUnique({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    select: { badgeScore: true, badgeLossCount: true },
  });
  const currentScore = (wallet?.badgeScore ??
    SEASON_START_BADGE_SCORE) as number;
  const nextLossCount = ((wallet?.badgeLossCount ?? 0) as number) + 1;
  const shouldDrop = nextLossCount >= BADGE_LOSS_BUFFER;
  const nextScore = Math.max(0, currentScore - (shouldDrop ? 1 : 0));
  const updated = await client.sponsorGameWallet.update({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    data: {
      badgeScore: nextScore,
      badgeLossCount: shouldDrop ? 0 : nextLossCount,
      seasonYm: nowYm,
    } as any,
    select: { badgeScore: true },
  });
  return (updated?.badgeScore ?? nextScore) as number;
}

export async function decSponsorPearls(
  tx: TxLike,
  userId: string,
  sponsorCode: string,
  gameId: string,
  amount = 1,
) {
  if (amount <= 0) return;
  const client = tx as any;
  const nowYm = seasonYm();

  const current = await getSponsorPearls(tx, userId, sponsorCode, gameId);
  if (current < amount) throw new Error('NOT_ENOUGH_PEARLS_SPONSOR');

  const data: any = { pearls: { decrement: amount }, seasonYm: nowYm };
  if (!isBadgeLossBufferEnabled()) {
    data.badgeScore = current - amount;
    data.badgeLossCount = 0;
  }
  await client.sponsorGameWallet.update({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    data,
  });
}

// -------------------- DEWANYAH (DewanyahGameWallet.pearls) --------------------
export async function getDewanyahPearls(
  tx: TxLike,
  userId: string,
  dewanyahId: string,
  gameId: string,
): Promise<number> {
  const client = tx as any;
  const nowYm = seasonYm();

  const w = await client.dewanyahGameWallet.upsert({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    update: {} as any,
    create: {
      userId,
      dewanyahId,
      gameId,
      pearls: SEASON_START_PEARLS,
      badgeScore: SEASON_START_BADGE_SCORE,
      badgeLossCount: 0,
      seasonYm: nowYm,
    } as any,
    select: {
      pearls: true,
      badgeScore: true,
      badgeLossCount: true,
      seasonYm: true,
    } as any,
  });

  const currentYm = (w?.seasonYm ?? 0) as number;
  if (currentYm !== nowYm) {
    const updated = await client.dewanyahGameWallet.update({
      where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
      data: {
        pearls: SEASON_START_PEARLS,
        badgeScore: SEASON_START_BADGE_SCORE,
        badgeLossCount: 0,
        seasonYm: nowYm,
      } as any,
      select: { pearls: true } as any,
    });
    return (updated?.pearls ?? 0) as number;
  }

  return (w?.pearls ?? 0) as number;
}

export async function incDewanyahPearls(
  tx: TxLike,
  userId: string,
  dewanyahId: string,
  gameId: string,
  amount = 1,
) {
  if (amount <= 0) return;
  const client = tx as any;
  const nowYm = seasonYm();

  const current = await getDewanyahPearls(tx, userId, dewanyahId, gameId);

  const data: any = { pearls: { increment: amount }, seasonYm: nowYm };
  if (!isBadgeLossBufferEnabled()) {
    data.badgeScore = current + amount;
    data.badgeLossCount = 0;
  }
  await client.dewanyahGameWallet.update({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    data,
  });
}

export async function getDewanyahBadgeScore(
  tx: TxLike,
  userId: string,
  dewanyahId: string,
  gameId: string,
): Promise<number> {
  const client = tx as any;
  const pearls = await getDewanyahPearls(tx, userId, dewanyahId, gameId);
  if (!isBadgeLossBufferEnabled()) return pearls;
  const wallet = await client.dewanyahGameWallet.findUnique({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    select: { badgeScore: true },
  });
  return (wallet?.badgeScore ?? SEASON_START_BADGE_SCORE) as number;
}

export async function recordDewanyahBadgeWin(
  tx: TxLike,
  userId: string,
  dewanyahId: string,
  gameId: string,
  amount = 1,
): Promise<number> {
  if (!isBadgeLossBufferEnabled()) {
    return getDewanyahBadgeScore(tx, userId, dewanyahId, gameId);
  }
  if (amount <= 0) return getDewanyahBadgeScore(tx, userId, dewanyahId, gameId);
  const client = tx as any;
  const nowYm = seasonYm();
  await getDewanyahPearls(tx, userId, dewanyahId, gameId);
  const updated = await client.dewanyahGameWallet.update({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    data: {
      badgeScore: { increment: amount },
      badgeLossCount: 0,
      seasonYm: nowYm,
    } as any,
    select: { badgeScore: true },
  });
  return (updated?.badgeScore ?? SEASON_START_BADGE_SCORE) as number;
}

export async function recordDewanyahBadgeLoss(
  tx: TxLike,
  userId: string,
  dewanyahId: string,
  gameId: string,
): Promise<number> {
  if (!isBadgeLossBufferEnabled()) {
    return getDewanyahBadgeScore(tx, userId, dewanyahId, gameId);
  }
  const client = tx as any;
  const nowYm = seasonYm();
  await getDewanyahPearls(tx, userId, dewanyahId, gameId);
  const wallet = await client.dewanyahGameWallet.findUnique({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    select: { badgeScore: true, badgeLossCount: true },
  });
  const currentScore = (wallet?.badgeScore ??
    SEASON_START_BADGE_SCORE) as number;
  const nextLossCount = ((wallet?.badgeLossCount ?? 0) as number) + 1;
  const shouldDrop = nextLossCount >= BADGE_LOSS_BUFFER;
  const nextScore = Math.max(0, currentScore - (shouldDrop ? 1 : 0));
  const updated = await client.dewanyahGameWallet.update({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    data: {
      badgeScore: nextScore,
      badgeLossCount: shouldDrop ? 0 : nextLossCount,
      seasonYm: nowYm,
    } as any,
    select: { badgeScore: true },
  });
  return (updated?.badgeScore ?? nextScore) as number;
}

export async function decDewanyahPearls(
  tx: TxLike,
  userId: string,
  dewanyahId: string,
  gameId: string,
  amount = 1,
) {
  if (amount <= 0) return;
  const client = tx as any;
  const nowYm = seasonYm();

  const current = await getDewanyahPearls(tx, userId, dewanyahId, gameId);
  if (current < amount) throw new Error('NOT_ENOUGH_PEARLS_DEWANYAH');

  const data: any = { pearls: { decrement: amount }, seasonYm: nowYm };
  if (!isBadgeLossBufferEnabled()) {
    data.badgeScore = current - amount;
    data.badgeLossCount = 0;
  }
  await client.dewanyahGameWallet.update({
    where: { userId_dewanyahId_gameId: { userId, dewanyahId, gameId } },
    data,
  });
}
