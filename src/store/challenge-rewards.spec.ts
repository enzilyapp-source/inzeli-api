import {
  evaluateRewards,
  challengeRewardsSnapshot,
  assertChallengeRewardAccess,
} from './challenge-rewards';
import { StoreService } from './store.service';
import { UsersController } from '../users/users.controller';

function fakeDatabase() {
  const inventory = new Map<string, any>();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([
      { gameId: 'شطرنج', wins: 5, played: 7 },
      { gameId: 'كوت', wins: 6, played: 8 },
      { gameId: 'بلوت', wins: 4, played: 4 },
    ]),
    userBadge: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ gameId: 'شطرنج', threshold: 15 }]),
    },
    userItem: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          [...inventory.values()].filter(
            (item) => item.userId === where.userId,
          ),
        ),
      ),
      createMany: jest.fn(({ data }: any) => {
        for (const item of data)
          inventory.set(`${item.userId}:${item.itemId}`, item);
        return Promise.resolve({ count: data.length });
      }),
    },
    storeItem: { createMany: jest.fn().mockResolvedValue({}) },
    user: {
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ vipUntil: null }),
    },
  };
  const prisma = { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) };
  return { prisma: prisma as any, tx, inventory };
}

it('uses existing badge thresholds, records no-match accounts as locked, and aggregates card wins', () => {
  expect(
    evaluateRewards([], [30], new Set())
      .filter((reward) => reward.unlocked)
      .map((reward) => reward.id)
      .sort()
      .join(',') === 'reward_banner_beginner,reward_tier_beginner',
  ).toBe(true);
  const rewards = evaluateRewards(
    [
      { gameId: 'كوت', wins: 6, played: 6 },
      { gameId: 'بلوت', wins: 4, played: 4 },
    ],
    [15],
    new Set(),
  );
  expect(
    rewards.find((reward) => reward.id === 'reward_rank_professional')
      ?.unlocked,
  ).toBe(true);
  expect(
    rewards.find((reward) => reward.id === 'reward_rank_crown')?.unlocked,
  ).toBe(false);
  expect(rewards.find((reward) => reward.id === 'reward_cards')?.unlocked).toBe(
    true,
  );
});

it('unlocks crown/diamond at Best; never treats losses as wins', () => {
  const rewards = evaluateRewards(
    [{ gameId: 'كوت', wins: 0, played: 50 }],
    [30],
    new Set(),
  );
  expect(
    rewards.find((reward) => reward.id === 'reward_rank_crown')?.unlocked,
  ).toBe(true);
  expect(
    rewards.find((reward) => reward.id === 'reward_rank_best')?.unlocked,
  ).toBe(true);
  expect(rewards.find((reward) => reward.id === 'reward_moon')?.unlocked).toBe(
    false,
  );
});

it('persists server-earned items idempotently without currency or seasonal writes', async () => {
  const { prisma, tx, inventory } = fakeDatabase();
  const first = await challengeRewardsSnapshot(prisma, 'alice');
  expect(first.ownedRewardIds).toContain('reward_chess');
  expect(first.ownedRewardIds).toContain('reward_cards');
  expect(first.ownedRewardIds).toContain('reward_rank_professional');
  const grants = tx.userItem.createMany.mock.calls.length;
  await challengeRewardsSnapshot(prisma, 'alice');
  expect(tx.userItem.createMany).toHaveBeenCalledTimes(grants);
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(
    [...inventory.values()].every(
      (item) => Object.keys(item).sort().join() === 'itemId,userId',
    ),
  ).toBe(true);
  // Beginning a new season or dropping a level cannot revoke owned frames.
  tx.userBadge.findMany.mockResolvedValue([]);
  tx.$queryRaw.mockResolvedValue([]);
  const nextSeason = await challengeRewardsSnapshot(prisma, 'alice');
  expect(nextSeason.ownedRewardIds).toEqual(first.ownedRewardIds);
  const otherAccount = await challengeRewardsSnapshot(prisma, 'bob');
  expect(otherAccount.ownedRewardIds.sort()).toEqual([
    'reward_banner_beginner',
    'reward_tier_beginner',
  ]);
});

it('ignores badge rows for games without a recorded match', async () => {
  const { prisma, tx } = fakeDatabase();
  tx.userBadge.findMany.mockResolvedValue([{ gameId: 'قدم', threshold: 30 }]);
  const snapshot = await challengeRewardsSnapshot(prisma, 'alice');
  expect(snapshot.ownedRewardIds).not.toContain('reward_rank_crown');
});

it('rejects unearned selection and purchasing a reward, and preserves legacy selections', async () => {
  const { prisma, tx } = fakeDatabase();
  await expect(
    assertChallengeRewardAccess(prisma, 'alice', 'reward_rank_crown'),
  ).rejects.toThrow('REWARD_LOCKED');
  await expect(
    assertChallengeRewardAccess(prisma, 'alice', 'reward_chess'),
  ).resolves.toBeUndefined();
  const service = new StoreService(prisma);
  await expect(service.buy('alice', 'reward_rank_crown')).rejects.toThrow(
    'REWARD_EARNED_ONLY',
  );
  const controller = new UsersController(prisma);
  for (const field of ['themeId', 'frameId', 'cardId']) {
    const result: any = await controller.updateMe(
      { user: { userId: 'alice' } },
      { [field]: 'reward_rank_crown' },
    );
    expect(result.ok).toBe(false);
  }
  expect(tx.user.update).not.toHaveBeenCalled();
  await controller.updateMe(
    { user: { userId: 'alice' } },
    { themeId: 'frame_ice' },
  );
  expect(tx.user.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { themeId: 'frame_ice' } }),
  );
});

it('heritage challenges retain unique slots, use historical win groups, and preserve earned awards', () => {
  const empty = evaluateRewards([], [], new Set());
  const heritage = empty.filter((reward) => reward.collection === 'heritage');
  expect(heritage).toHaveLength(12);
  expect(heritage.map((reward) => reward.slot)).toEqual(
    Array.from({ length: 12 }, (_, i) => i + 15),
  );
  expect(new Set(empty.map((reward) => reward.id)).size).toBe(37);
  expect(heritage.every((reward) => !reward.unlocked)).toBe(true);
  const mixed = evaluateRewards(
    [
      { gameId: 'كوت', wins: 20, played: 30 },
      { gameId: 'بلوت', wins: 10, played: 10 },
      { gameId: 'شطرنج', wins: 15, played: 18 },
      { gameId: 'طاوله', wins: 15, played: 18 },
      { gameId: 'قدم', wins: 15, played: 20 },
    ],
    [15],
    new Set(),
  );
  for (const id of [
    'reward_heritage_cards',
    'reward_heritage_chess',
    'reward_heritage_dice',
    'reward_heritage_fort',
    'reward_heritage_falcon',
  ]) {
    expect(mixed.find((reward) => reward.id === id)?.unlocked).toBe(true);
  }
  const losses = evaluateRewards(
    [{ gameId: 'شطرنج', wins: 0, played: 90 }],
    [5],
    new Set(['reward_heritage_chess']),
  );
  expect(
    losses.find((reward) => reward.id === 'reward_heritage_chess')?.unlocked,
  ).toBe(true);
  expect(
    losses.find((reward) => reward.id === 'reward_heritage_falcon')?.unlocked,
  ).toBe(false);
});

it('rank frames and banners unlock together in the approved metal order, including free Beginner', async () => {
  const keys = ['beginner', 'good', 'professional', 'legend', 'best'];
  const thresholds = [5, 10, 15, 20, 30];
  const slots = [1, 2, 3, 4, 5];
  thresholds.forEach((tier, index) => {
    const rewards = evaluateRewards(
      [{ gameId: 'كوت', wins: 1, played: 1 }],
      [tier],
      new Set(),
    );
    keys.forEach((key, step) => {
      const frame = rewards.find(
        (reward) => reward.id === `reward_tier_${key}`,
      )!;
      const banner = rewards.find(
        (reward) => reward.id === `reward_banner_${key}`,
      )!;
      expect(frame.slot).toBe(slots[step]);
      expect(frame.unlocked).toBe(step <= index);
      expect(banner.unlocked).toBe(frame.unlocked);
      expect(frame.itemKind).toBe('theme');
      expect(banner.itemKind).toBe('card');
    });
  });
  const { prisma, tx } = fakeDatabase();
  await challengeRewardsSnapshot(prisma, 'alice');
  expect(tx.storeItem.createMany.mock.calls[0][0].data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'reward_banner_professional',
        kind: 'card',
      }),
    ]),
  );
  await expect(
    assertChallengeRewardAccess(
      prisma,
      'alice',
      'reward_banner_professional',
      'card',
    ),
  ).resolves.toBeUndefined();
  await expect(
    assertChallengeRewardAccess(
      prisma,
      'alice',
      'reward_banner_professional',
      'theme',
    ),
  ).rejects.toThrow('REWARD_KIND_MISMATCH');
});
