import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Stable IDs are permanent entitlements. Never recycle an ID for a new rule.
// These rewards use the existing StoreItem/UserItem tables, not seasonal wallets.
export const CHALLENGE_REWARDS = [
  { id: 'reward_rank_beginner', name: 'إطار عليمي الفضي', tier: 5, slot: 0 },
  { id: 'reward_rank_good', name: 'إطار زين البرونزي', tier: 10, slot: 1 },
  {
    id: 'reward_rank_professional',
    name: 'إطار محترف الفضي',
    tier: 15,
    slot: 2,
  },
  { id: 'reward_rank_legend', name: 'إطار أسطوري الذهبي', tier: 20, slot: 3 },
  { id: 'reward_rank_best', name: 'إطار أحسن واحد الماسي', tier: 30, slot: 4 },
  { id: 'reward_rank_crown', name: 'تاج أحسن واحد', tier: 30, slot: 5 },
  {
    id: 'reward_cards',
    name: 'بطل الجنجفة',
    games: ['كوت', 'بلوت', 'تريكس', 'هند', 'سبيتة', 'اونو', 'دفان'],
    target: 10,
    slot: 6,
  },
  {
    id: 'reward_dice',
    name: 'بطل الطاولة',
    games: ['طاوله'],
    target: 5,
    slot: 7,
  },
  {
    id: 'reward_chess',
    name: 'بطل الشطرنج',
    games: ['شطرنج'],
    target: 5,
    slot: 8,
  },
  {
    id: 'reward_football',
    name: 'بطل القدم',
    games: ['قدم'],
    target: 5,
    slot: 9,
  },
  {
    id: 'reward_tennis',
    name: 'بطل المضرب',
    games: ['تنس ارضي', 'تنس طاولة', 'بادل'],
    target: 5,
    slot: 10,
  },
  {
    id: 'reward_basketball',
    name: 'بطل السلة',
    games: ['سله'],
    target: 5,
    slot: 11,
  },
  {
    id: 'reward_billiards',
    name: 'بطل البلياردو',
    games: ['بلياردو'],
    target: 5,
    slot: 12,
  },
  {
    id: 'reward_bowling',
    name: 'بطل البولنج',
    games: ['بولنج'],
    target: 5,
    slot: 13,
  },
  { id: 'reward_moon', name: 'نجم إنزلي', games: [], target: 50, slot: 14 },
  {
    id: 'reward_heritage_gold',
    name: 'زخرفة الديرة',
    games: [],
    target: 3,
    slot: 15,
  },
  {
    id: 'reward_heritage_dhow',
    name: 'نوخذة الخليج',
    games: [],
    target: 10,
    slot: 16,
  },
  {
    id: 'reward_heritage_towers',
    name: 'أبراج الكويت',
    games: [],
    target: 25,
    slot: 17,
  },
  {
    id: 'reward_heritage_ghutra',
    name: 'راعي الديوانية',
    games: ['شطرنج', 'دامه', 'كيرم', 'دومنه', 'طاوله', 'جاكارو'],
    target: 5,
    slot: 18,
  },
  {
    id: 'reward_heritage_fort',
    name: 'راية الديرة',
    games: [
      'بلياردو',
      'بيبيفوت',
      'قدم',
      'سله',
      'طائره',
      'بولنج',
      'بادل',
      'تنس طاولة',
      'تنس ارضي',
    ],
    target: 15,
    slot: 19,
  },
  {
    id: 'reward_heritage_coffee',
    name: 'دلة الديوانية',
    games: ['كوت', 'بلوت', 'تريكس', 'هند', 'سبيتة', 'اونو', 'دفان'],
    target: 20,
    slot: 20,
  },
  {
    id: 'reward_heritage_camp',
    name: 'ليالي البر',
    games: ['شطرنج', 'دامه', 'كيرم', 'دومنه', 'طاوله', 'جاكارو'],
    target: 10,
    slot: 21,
  },
  {
    id: 'reward_heritage_swords',
    name: 'سيف الفوز',
    games: [],
    target: 30,
    slot: 22,
  },
  {
    id: 'reward_heritage_falcon',
    name: 'صقر إنزلي',
    games: [],
    target: 75,
    slot: 23,
  },
  {
    id: 'reward_heritage_cards',
    name: 'ملك الجنجفة',
    games: ['كوت', 'بلوت', 'تريكس', 'هند', 'سبيتة', 'اونو', 'دفان'],
    target: 30,
    slot: 24,
  },
  {
    id: 'reward_heritage_dice',
    name: 'شيخ الطاولة',
    games: ['طاوله'],
    target: 15,
    slot: 25,
  },
  {
    id: 'reward_heritage_chess',
    name: 'فارس الشطرنج',
    games: ['شطرنج'],
    target: 15,
    slot: 26,
  },
  {
    id: 'reward_tier_beginner',
    name: 'إطار عليمي',
    tier: 5,
    slot: 1,
    itemKind: 'theme',
    starter: true,
  },
  {
    id: 'reward_banner_beginner',
    name: 'بنر عليمي',
    tier: 5,
    slot: 1,
    itemKind: 'card',
    starter: true,
  },
  {
    id: 'reward_tier_good',
    name: 'إطار زين',
    tier: 10,
    slot: 2,
    itemKind: 'theme',
    starter: false,
  },
  {
    id: 'reward_banner_good',
    name: 'بنر زين',
    tier: 10,
    slot: 2,
    itemKind: 'card',
    starter: false,
  },
  {
    id: 'reward_tier_professional',
    name: 'إطار محترف',
    tier: 15,
    slot: 3,
    itemKind: 'theme',
    starter: false,
  },
  {
    id: 'reward_banner_professional',
    name: 'بنر محترف',
    tier: 15,
    slot: 3,
    itemKind: 'card',
    starter: false,
  },
  {
    id: 'reward_tier_legend',
    name: 'إطار أسطوري',
    tier: 20,
    slot: 4,
    itemKind: 'theme',
    starter: false,
  },
  {
    id: 'reward_banner_legend',
    name: 'بنر أسطوري',
    tier: 20,
    slot: 4,
    itemKind: 'card',
    starter: false,
  },
  {
    id: 'reward_tier_best',
    name: 'إطار أحسن واحد',
    tier: 30,
    slot: 5,
    itemKind: 'theme',
    starter: false,
  },
  {
    id: 'reward_banner_best',
    name: 'بنر أحسن واحد',
    tier: 30,
    slot: 5,
    itemKind: 'card',
    starter: false,
  },
] as const;

export type RewardId = (typeof CHALLENGE_REWARDS)[number]['id'];
export function isChallengeReward(id: string): boolean {
  return CHALLENGE_REWARDS.some((reward) => reward.id === id);
}

type GameRecord = { gameId: string; wins: number; played: number };

export function evaluateRewards(
  records: GameRecord[],
  badgeThresholds: number[],
  owned: Set<string>,
) {
  const played = records.reduce(
    (sum, record) => sum + Number(record.played),
    0,
  );
  const highestTier = played > 0 ? Math.max(5, ...badgeThresholds) : 0;
  return CHALLENGE_REWARDS.map((reward) => {
    const rankReward = 'tier' in reward;
    const target = rankReward ? reward.tier : reward.target;
    const progress = rankReward
      ? 'starter' in reward && reward.starter
        ? Math.max(5, highestTier)
        : highestTier
      : records.reduce(
          (sum, record) =>
            reward.games.length === 0 ||
            (reward.games as readonly string[]).includes(record.gameId)
              ? sum + Number(record.wins)
              : sum,
          0,
        );
    return {
      ...reward,
      itemKind: 'itemKind' in reward ? reward.itemKind : 'theme',
      legacyRank: rankReward && !('itemKind' in reward),
      collection: reward.slot >= 15 ? 'heritage' : 'classic',
      kind: rankReward ? 'rank' : 'wins',
      target,
      progress: Math.max(0, progress),
      unlocked: owned.has(reward.id) || progress >= target,
      permanent: true,
    };
  });
}

/** Derive eligibility only from server match results and saved badge history.
 * Grant missing items atomically and idempotently; never debit currency.
 * Existing UserItem ownership survives season resets and declining levels.
 */
export async function challengeRewardsSnapshot(
  prisma: PrismaService,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const [records, badges, inventory] = await Promise.all([
      tx.$queryRaw<GameRecord[]>`
        SELECT m."gameId", COUNT(*)::int AS played,
          COUNT(*) FILTER (WHERE p.outcome = 'WIN')::int AS wins
        FROM "MatchParticipant" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p."userId" = ${userId} GROUP BY m."gameId"
      `,
      tx.userBadge.findMany({
        where: { userId },
        select: { gameId: true, threshold: true },
      }),
      tx.userItem.findMany({
        where: {
          userId,
          itemId: { in: CHALLENGE_REWARDS.map((reward) => reward.id) },
        },
        select: { itemId: true },
      }),
    ]);
    const owned = new Set(inventory.map((item) => item.itemId));
    const playedGames = new Set(records.map((record) => record.gameId));
    const rewards = evaluateRewards(
      records,
      badges
        .filter(
          (badge) => badge.gameId !== null && playedGames.has(badge.gameId),
        )
        .map((badge) => badge.threshold),
      owned,
    );
    const grants = rewards.filter(
      (reward) => reward.unlocked && !owned.has(reward.id),
    );
    if (grants.length) {
      // ON CONFLICT DO NOTHING also handles two devices claiming concurrently.
      await tx.storeItem.createMany({
        data: grants.map((reward) => ({
          id: reward.id,
          name: reward.name,
          kind: reward.itemKind,
          price: 0,
          active: false,
          description: 'جائزة تحدي دائمة • لا تنتهي بانتهاء الموسم',
        })),
        skipDuplicates: true,
      });
      await tx.userItem.createMany({
        data: grants.map((reward) => ({ userId, itemId: reward.id })),
        skipDuplicates: true,
      });
    }
    return {
      rewards,
      ownedRewardIds: rewards
        .filter((reward) => reward.unlocked)
        .map((reward) => reward.id),
    };
  });
}

export async function assertChallengeRewardAccess(
  prisma: PrismaService,
  userId: string,
  id: string,
  requestedKind?: 'theme' | 'frame' | 'card',
) {
  const reward = CHALLENGE_REWARDS.find((entry) => entry.id === id);
  if (!reward) return;
  const kind = 'itemKind' in reward ? reward.itemKind : 'theme';
  if (requestedKind && requestedKind !== kind)
    throw new BadRequestException('REWARD_KIND_MISMATCH');
  const snapshot = await challengeRewardsSnapshot(prisma, userId);
  if (!snapshot.ownedRewardIds.includes(id as RewardId)) {
    throw new BadRequestException('REWARD_LOCKED');
  }
}
