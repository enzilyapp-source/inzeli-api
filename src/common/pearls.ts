// src/common/pearls.ts
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type TxLike = PrismaService | Prisma.TransactionClient;

const SEASON_START_PEARLS = 5;
const DEFAULT_GAMES = [
  'كوت',
  'بلوت',
  'تريكس',
  'هند',
  'سبيتة',
  'شطرنج',
  'دامه',
  'كيرم',
  'دومنه',
  'طاولة',
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

async function ensureUserGameWallet(tx: TxLike, userId: string, gameId: string): Promise<number> {
  const client = tx as any;
  const nowYm = seasonYm();

  const w = await client.userGameWallet.upsert({
    where: { userId_gameId: { userId, gameId } },
    update: {} as any,
    create: { userId, gameId, pearls: SEASON_START_PEARLS, seasonYm: nowYm } as any,
    select: { pearls: true, seasonYm: true } as any,
  });

  const currentYm = (w?.seasonYm ?? 0) as number;
  if (currentYm !== nowYm) {
    const updated = await client.userGameWallet.update({
      where: { userId_gameId: { userId, gameId } },
      data: { pearls: SEASON_START_PEARLS, seasonYm: nowYm } as any,
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

// -------------------- REGULAR (User per-game pearls) --------------------
export async function getGamePearls(tx: TxLike, userId: string, gameId: string): Promise<number> {
  return ensureUserGameWallet(tx, userId, gameId);
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
  await ensureUserGameWallet(tx, userId, gameId);

  await client.userGameWallet.update({
    where: { userId_gameId: { userId, gameId } },
    data: { pearls: { increment: amount }, seasonYm: nowYm } as any,
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

  await client.userGameWallet.update({
    where: { userId_gameId: { userId, gameId } },
    data: { pearls: { decrement: amount }, seasonYm: nowYm } as any,
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
    create: { userId, sponsorCode, gameId, pearls: SEASON_START_PEARLS, seasonYm: nowYm } as any,
    select: { pearls: true, seasonYm: true } as any,
  });

  const currentYm = (w?.seasonYm ?? 0) as number;
  if (currentYm !== nowYm) {
    const updated = await client.sponsorGameWallet.update({
      where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
      data: { pearls: SEASON_START_PEARLS, seasonYm: nowYm } as any,
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
  await getSponsorPearls(tx, userId, sponsorCode, gameId);

  await client.sponsorGameWallet.update({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    data: { pearls: { increment: amount }, seasonYm: nowYm } as any,
  });
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

  await client.sponsorGameWallet.update({
    where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
    data: { pearls: { decrement: amount }, seasonYm: nowYm } as any,
  });
}
