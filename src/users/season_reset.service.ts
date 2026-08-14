import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import {
  awardBadgesForBalance,
  badgeContext,
  seasonRange,
  seasonYm,
} from '../common/badges';
import { isBadgeLossBufferEnabled } from '../common/pearls';
import { PrismaService } from '../prisma.service';

const RESET_PEARLS = 5;
const SEASON_RESET_KIND = 'MONTHLY_SEASON_RESET';
const AUTO_RESET_INTERVAL_MS = 6 * 60 * 60 * 1000;

type PushResult = {
  sent: boolean;
  response?: unknown;
  error?: string;
};

type OneSignalPlayer = {
  id?: string;
};

@Injectable()
export class SeasonResetService implements OnModuleInit, OnModuleDestroy {
  private resetTimer?: NodeJS.Timeout;
  private running = false;

  private readonly oneSignalAppId = process.env.ONESIGNAL_APP_ID || '';
  private readonly oneSignalRestApiKey =
    process.env.ONESIGNAL_REST_API_KEY || '';

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.AUTO_MONTHLY_SEASON_RESET === 'false') return;

    setTimeout(() => {
      void this.runMonthlySeasonReset({ source: 'auto' }).catch((error) => {
        console.warn(`Monthly season reset failed: ${error?.message || error}`);
      });
    }, 30_000).unref?.();

    this.resetTimer = setInterval(() => {
      void this.runMonthlySeasonReset({ source: 'auto' }).catch((error) => {
        console.warn(`Monthly season reset failed: ${error?.message || error}`);
      });
    }, AUTO_RESET_INTERVAL_MS);
    this.resetTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.resetTimer) clearInterval(this.resetTimer);
    this.resetTimer = undefined;
  }

  async sendBroadcast(params: {
    titleAr: string;
    messageAr: string;
    titleEn?: string;
    messageEn?: string;
    data?: Record<string, unknown>;
  }): Promise<PushResult> {
    if (!this.oneSignalAppId || !this.oneSignalRestApiKey) {
      return { sent: false, error: 'ONESIGNAL_ENV_MISSING' };
    }

    const payload = {
      app_id: this.oneSignalAppId,
      target_channel: 'push',
      included_segments: ['Subscribed Users'],
      headings: {
        ar: params.titleAr,
        en: params.titleEn || params.titleAr,
      },
      contents: {
        ar: params.messageAr,
        en: params.messageEn || params.messageAr,
      },
      data: params.data ?? {},
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    const result = await this.sendOneSignal(payload);
    if (result.sent || !this.shouldRetryWithSubscriptions(result.error)) {
      return result;
    }

    return this.sendOneSignalToSubscribedPlayers(payload, result);
  }

  async sendSeasonEndedNotice() {
    const ym = seasonYm();
    return this.sendBroadcast({
      titleAr: 'انتهى السيزن الشهري',
      messageAr:
        'انتهى السيزن ورجعت اللآلئ إلى ٥. الليدربورد بدأ من جديد، والانواط محفوظة.',
      titleEn: 'Monthly season ended',
      messageEn:
        'The season ended and pearls are back to 5. Leaderboards restarted, and badges are saved.',
      data: {
        type: SEASON_RESET_KIND,
        seasonYm: ym,
        resetPearls: RESET_PEARLS,
      },
    });
  }

  async runMonthlySeasonReset(options?: {
    dryRun?: boolean;
    force?: boolean;
    sendPush?: boolean;
    source?: 'auto' | 'admin';
  }) {
    if (this.running) {
      return { skipped: true, reason: 'RESET_ALREADY_RUNNING' };
    }

    this.running = true;
    try {
      const ym = seasonYm();
      const range = seasonRange(ym);
      const dryRun = options?.dryRun === true;
      const force = options?.force === true;
      const sendPush = options?.sendPush !== false;
      const source = options?.source ?? 'admin';
      const badgeLossBufferEnabled = isBadgeLossBufferEnabled();

      const existing = await this.prisma.timelineEvent.findFirst({
        where: {
          kind: SEASON_RESET_KIND,
          createdAt: { gte: range.gte, lt: range.lt },
        },
        select: { id: true, createdAt: true, meta: true },
      });
      if (existing && !force) {
        return {
          skipped: true,
          reason: 'SEASON_ALREADY_RESET',
          seasonYm: ym,
          markerId: existing.id,
          markerCreatedAt: existing.createdAt,
        };
      }

      const preview = await this.previewResetCounts(ym, badgeLossBufferEnabled);
      if (dryRun) {
        return { dryRun: true, seasonYm: ym, ...preview };
      }

      const result = await this.prisma.$transaction(
        async (tx) => {
          let badgeAwards = 0;
          const earnedAt = new Date();
          const badgeAwardWhere = badgeLossBufferEnabled
            ? { badgeScore: { gt: RESET_PEARLS } }
            : { pearls: { gt: RESET_PEARLS } };

          const userWallets = await tx.userGameWallet.findMany({
            where: badgeAwardWhere,
            select: {
              userId: true,
              gameId: true,
              pearls: true,
              badgeScore: true,
              seasonYm: true,
            },
          });
          for (const wallet of userWallets) {
            badgeAwards += await awardBadgesForBalance(tx, {
              userId: wallet.userId,
              balance: badgeLossBufferEnabled
                ? wallet.badgeScore
                : wallet.pearls,
              seasonYm: wallet.seasonYm ?? ym,
              earnedAt,
              context: badgeContext({ gameId: wallet.gameId }),
            });
          }

          const sponsorWallets = await tx.sponsorGameWallet.findMany({
            where: badgeAwardWhere,
            select: {
              userId: true,
              sponsorCode: true,
              gameId: true,
              pearls: true,
              badgeScore: true,
              seasonYm: true,
            },
          });
          for (const wallet of sponsorWallets) {
            badgeAwards += await awardBadgesForBalance(tx, {
              userId: wallet.userId,
              balance: badgeLossBufferEnabled
                ? wallet.badgeScore
                : wallet.pearls,
              seasonYm: wallet.seasonYm ?? ym,
              earnedAt,
              context: badgeContext({
                gameId: wallet.gameId,
                sponsorCode: wallet.sponsorCode,
              }),
            });
          }

          const dewanyahWallets = await tx.dewanyahGameWallet.findMany({
            where: badgeAwardWhere,
            select: {
              userId: true,
              dewanyahId: true,
              gameId: true,
              pearls: true,
              badgeScore: true,
              seasonYm: true,
            },
          });
          for (const wallet of dewanyahWallets) {
            badgeAwards += await awardBadgesForBalance(tx, {
              userId: wallet.userId,
              balance: badgeLossBufferEnabled
                ? wallet.badgeScore
                : wallet.pearls,
              seasonYm: wallet.seasonYm ?? ym,
              earnedAt,
              context: badgeContext({
                gameId: wallet.gameId,
                dewanyahId: wallet.dewanyahId,
              }),
            });
          }

          const leaderSnapshots = await this.snapshotScopedMonthlyLeaders(
            tx,
            ym,
            source === 'auto' ? 'season_reset_auto' : 'season_reset_admin',
          );

          const [
            users,
            userGameWallets,
            sponsorGameWallets,
            dewanyahGameWallets,
          ] = await Promise.all([
            tx.user.updateMany({
              data: {
                pearls: RESET_PEARLS,
                creditPoints: RESET_PEARLS,
                pearlsSeasonYm: ym,
              },
            }),
            tx.userGameWallet.updateMany({
              data: {
                pearls: RESET_PEARLS,
                badgeScore: RESET_PEARLS,
                badgeLossCount: 0,
                seasonYm: ym,
              },
            }),
            tx.sponsorGameWallet.updateMany({
              data: {
                pearls: RESET_PEARLS,
                badgeScore: RESET_PEARLS,
                badgeLossCount: 0,
                seasonYm: ym,
              },
            }),
            tx.dewanyahGameWallet.updateMany({
              data: {
                pearls: RESET_PEARLS,
                badgeScore: RESET_PEARLS,
                badgeLossCount: 0,
                seasonYm: ym,
              },
            }),
          ]);

          const marker = await tx.timelineEvent.create({
            data: {
              kind: SEASON_RESET_KIND,
              meta: {
                seasonYm: ym,
                source,
                resetPearls: RESET_PEARLS,
                badgeAwards,
                usersUpdated: users.count,
                userGameWalletsUpdated: userGameWallets.count,
                sponsorGameWalletsUpdated: sponsorGameWallets.count,
                dewanyahGameWalletsUpdated: dewanyahGameWallets.count,
                leaderSnapshots,
              } as Prisma.InputJsonValue,
            },
            select: { id: true },
          });

          return {
            seasonYm: ym,
            markerId: marker.id,
            badgeAwards,
            usersUpdated: users.count,
            userGameWalletsUpdated: userGameWallets.count,
            sponsorGameWalletsUpdated: sponsorGameWallets.count,
            dewanyahGameWalletsUpdated: dewanyahGameWallets.count,
            leaderSnapshots,
          };
        },
        { timeout: 60_000 },
      );

      const push = sendPush ? await this.sendSeasonEndedNotice() : undefined;
      return { skipped: false, ...result, push };
    } finally {
      this.running = false;
    }
  }

  private async previewResetCounts(
    ym: number,
    badgeLossBufferEnabled = isBadgeLossBufferEnabled(),
  ) {
    const badgeAwardWhere = badgeLossBufferEnabled
      ? { badgeScore: { gt: RESET_PEARLS } }
      : { pearls: { gt: RESET_PEARLS } };
    const [
      users,
      usersNeedingReset,
      userGameWallets,
      userGameWalletsNeedingReset,
      sponsorGameWallets,
      sponsorGameWalletsNeedingReset,
      dewanyahGameWallets,
      dewanyahGameWalletsNeedingReset,
      badgeEligibleWallets,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          OR: [
            { pearls: { not: RESET_PEARLS } },
            { creditPoints: { not: RESET_PEARLS } },
            { pearlsSeasonYm: { not: ym } },
          ],
        },
      }),
      this.prisma.userGameWallet.count(),
      this.prisma.userGameWallet.count({
        where: {
          OR: [
            { pearls: { not: RESET_PEARLS } },
            { badgeScore: { not: RESET_PEARLS } },
            { badgeLossCount: { not: 0 } },
            { seasonYm: { not: ym } },
          ],
        },
      }),
      this.prisma.sponsorGameWallet.count(),
      this.prisma.sponsorGameWallet.count({
        where: {
          OR: [
            { pearls: { not: RESET_PEARLS } },
            { badgeScore: { not: RESET_PEARLS } },
            { badgeLossCount: { not: 0 } },
            { seasonYm: { not: ym } },
          ],
        },
      }),
      this.prisma.dewanyahGameWallet.count(),
      this.prisma.dewanyahGameWallet.count({
        where: {
          OR: [
            { pearls: { not: RESET_PEARLS } },
            { badgeScore: { not: RESET_PEARLS } },
            { badgeLossCount: { not: 0 } },
            { seasonYm: { not: ym } },
          ],
        },
      }),
      Promise.all([
        this.prisma.userGameWallet.count({
          where: badgeAwardWhere,
        }),
        this.prisma.sponsorGameWallet.count({
          where: badgeAwardWhere,
        }),
        this.prisma.dewanyahGameWallet.count({
          where: badgeAwardWhere,
        }),
      ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)),
    ]);

    return {
      resetPearls: RESET_PEARLS,
      users,
      usersNeedingReset,
      userGameWallets,
      userGameWalletsNeedingReset,
      sponsorGameWallets,
      sponsorGameWalletsNeedingReset,
      dewanyahGameWallets,
      dewanyahGameWalletsNeedingReset,
      badgeEligibleWallets,
    };
  }

  private async snapshotScopedMonthlyLeaders(
    tx: Prisma.TransactionClient,
    ym: number,
    reason: string,
  ) {
    const range = seasonRange(ym);
    const snapshots: Array<{
      scope: $Enums.BadgeScope;
      seasonYm: number;
      sponsorCode?: string;
      sponsorName?: string;
      dewanyahId?: string;
      dewanyahName?: string;
      gameId: string;
      leaderUserId: string;
      leaderName: string;
      leaderEmail?: string | null;
      pearls: number;
      wins: number;
      losses: number;
      playedCount: number;
      reason: string;
    }> = [];

    const sponsorGames = await tx.sponsorGame.findMany({
      include: {
        sponsor: { select: { code: true, name: true } },
      },
      orderBy: [{ sponsorCode: 'asc' }, { gameId: 'asc' }],
    });
    for (const sg of sponsorGames) {
      const wallets = await tx.sponsorGameWallet.findMany({
        where: {
          sponsorCode: sg.sponsorCode,
          gameId: sg.gameId,
          user: { hideFromLeaderboard: false },
        },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      });
      const userIds = wallets.map((w) => w.userId);
      if (!userIds.length) continue;
      const stats = await this.matchStatsForUsers(tx, {
        userIds,
        gameId: sg.gameId,
        sponsorCode: sg.sponsorCode,
        range,
      });
      const leader = wallets
        .map((w) => {
          const stat = stats.get(w.userId) ?? this.emptyMatchStats();
          return {
            userId: w.userId,
            displayName:
              w.user?.displayName?.trim() || w.user?.email?.trim() || 'لاعب',
            email: w.user?.email ?? null,
            pearls: w.seasonYm === ym ? w.pearls : RESET_PEARLS,
            ...stat,
          };
        })
        .filter((row) => row.playedCount > 0)
        .sort((a, b) => {
          const pearls = b.pearls - a.pearls;
          if (pearls !== 0) return pearls;
          return (
            (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0)
          );
        })[0];
      if (!leader) continue;
      snapshots.push({
        scope: $Enums.BadgeScope.SPONSOR,
        seasonYm: ym,
        sponsorCode: sg.sponsorCode,
        sponsorName: sg.sponsor?.name ?? sg.sponsorCode,
        gameId: sg.gameId,
        leaderUserId: leader.userId,
        leaderName: leader.displayName,
        leaderEmail: leader.email,
        pearls: leader.pearls,
        wins: leader.wins,
        losses: leader.losses,
        playedCount: leader.playedCount,
        reason,
      });
    }

    const dewanyahGames = await tx.dewanyahGame.findMany({
      include: {
        dewanyah: { select: { id: true, name: true } },
      },
      orderBy: [{ dewanyahId: 'asc' }, { gameId: 'asc' }],
    });
    for (const dg of dewanyahGames) {
      const members = await tx.dewanyahMember.findMany({
        where: {
          dewanyahId: dg.dewanyahId,
          status: 'approved',
          user: { hideFromLeaderboard: false },
        },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      });
      const userIds = members.map((m) => m.userId);
      if (!userIds.length) continue;
      const wallets = await tx.dewanyahGameWallet.findMany({
        where: {
          dewanyahId: dg.dewanyahId,
          gameId: dg.gameId,
          userId: { in: userIds },
        },
        select: { userId: true, pearls: true, seasonYm: true, updatedAt: true },
      });
      const walletMap = new Map(wallets.map((w) => [w.userId, w]));
      const stats = await this.matchStatsForUsers(tx, {
        userIds,
        gameId: dg.gameId,
        dewanyahId: dg.dewanyahId,
        range,
      });
      const leader = members
        .map((m) => {
          const wallet = walletMap.get(m.userId);
          const stat = stats.get(m.userId) ?? this.emptyMatchStats();
          return {
            userId: m.userId,
            displayName:
              m.user?.displayName?.trim() || m.user?.email?.trim() || 'لاعب',
            email: m.user?.email ?? null,
            pearls: wallet?.seasonYm === ym ? wallet.pearls : RESET_PEARLS,
            joinedAt: m.createdAt,
            ...stat,
          };
        })
        .filter((row) => row.playedCount > 0)
        .sort((a, b) => {
          const pearls = b.pearls - a.pearls;
          if (pearls !== 0) return pearls;
          return (
            (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0)
          );
        })[0];
      if (!leader) continue;
      snapshots.push({
        scope: $Enums.BadgeScope.DEWANYAH,
        seasonYm: ym,
        dewanyahId: dg.dewanyahId,
        dewanyahName: dg.dewanyah?.name ?? 'ديوانية',
        gameId: dg.gameId,
        leaderUserId: leader.userId,
        leaderName: leader.displayName,
        leaderEmail: leader.email,
        pearls: leader.pearls,
        wins: leader.wins,
        losses: leader.losses,
        playedCount: leader.playedCount,
        reason,
      });
    }

    if (snapshots.length > 0) {
      await tx.monthlyLeaderboardSnapshot.createMany({ data: snapshots });
    }

    return snapshots.length;
  }

  private emptyMatchStats() {
    return {
      wins: 0,
      losses: 0,
      playedCount: 0,
      lastPlayedAt: null as Date | null,
    };
  }

  private async matchStatsForUsers(
    tx: Prisma.TransactionClient,
    params: {
      userIds: string[];
      gameId: string;
      sponsorCode?: string;
      dewanyahId?: string;
      range: { gte: Date; lt: Date };
    },
  ) {
    const stats = new Map<
      string,
      {
        wins: number;
        losses: number;
        playedCount: number;
        lastPlayedAt: Date | null;
      }
    >();
    for (const userId of params.userIds)
      stats.set(userId, this.emptyMatchStats());

    const parts = await tx.matchParticipant.findMany({
      where: {
        userId: { in: params.userIds },
        match: {
          gameId: params.gameId,
          createdAt: params.range,
          ...(params.sponsorCode ? { sponsorCode: params.sponsorCode } : {}),
          ...(params.dewanyahId
            ? { room: { is: { dewanyahId: params.dewanyahId } } }
            : {}),
        },
      },
      select: {
        userId: true,
        outcome: true,
        match: { select: { createdAt: true } },
      },
      orderBy: { match: { createdAt: 'desc' } },
      take: 5000,
    });

    for (const part of parts) {
      const row = stats.get(part.userId) ?? this.emptyMatchStats();
      row.playedCount += 1;
      if (part.outcome === 'WIN') row.wins += 1;
      if (part.outcome === 'LOSS') row.losses += 1;
      const playedAt = part.match.createdAt;
      if (
        !row.lastPlayedAt ||
        playedAt.getTime() > row.lastPlayedAt.getTime()
      ) {
        row.lastPlayedAt = playedAt;
      }
      stats.set(part.userId, row);
    }

    return stats;
  }

  private async sendOneSignal(
    payload: Record<string, unknown>,
  ): Promise<PushResult> {
    try {
      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.oneSignalRestApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let parsed: unknown = raw;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = raw;
      }

      if (!res.ok) {
        const message =
          (parsed as any)?.errors?.[0] ||
          (parsed as any)?.error ||
          (parsed as any)?.message ||
          raw ||
          'Push failed';
        return { sent: false, error: String(message), response: parsed };
      }

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as any).id !== 'string' ||
        !(parsed as any).id
      ) {
        const message =
          (parsed as any)?.errors?.[0] ||
          (parsed as any)?.error ||
          'OneSignal accepted the request but did not create a notification. The target audience may have no valid push subscriptions.';
        return { sent: false, error: String(message), response: parsed };
      }

      return { sent: true, response: parsed };
    } catch (error: any) {
      return { sent: false, error: error?.message || String(error) };
    }
  }

  private shouldRetryWithSubscriptions(error?: string) {
    const normalized = (error || '').toLowerCase();
    return (
      normalized.includes('not subscribed') ||
      normalized.includes('no valid push subscriptions') ||
      normalized.includes('no subscribers')
    );
  }

  private async sendOneSignalToSubscribedPlayers(
    originalPayload: Record<string, unknown>,
    firstResult: PushResult,
  ): Promise<PushResult> {
    try {
      const subscriptionIds = await this.listOneSignalPlayerIds();
      if (!subscriptionIds.length) {
        return {
          sent: false,
          error:
            'ONESIGNAL_NO_DEVICE_RECORDS. Check that ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY belong to the same OneSignal app that has subscribed devices.',
          response: firstResult.response,
        };
      }

      const payload = {
        ...originalPayload,
        include_subscription_ids: subscriptionIds,
      };
      delete (payload as any).included_segments;

      const result = await this.sendOneSignal(payload);
      if (
        result.sent &&
        result.response &&
        typeof result.response === 'object'
      ) {
        return {
          sent: true,
          response: {
            ...(result.response as Record<string, unknown>),
            directRecipients: subscriptionIds.length,
            fallbackTarget: 'include_subscription_ids',
          },
        };
      }
      return result;
    } catch (error: any) {
      return {
        sent: false,
        error: error?.message || String(error),
        response: firstResult.response,
      };
    }
  }

  private async listOneSignalPlayerIds() {
    const ids: string[] = [];
    const limit = 300;
    let offset = 0;
    let totalCount: number | undefined;

    while (ids.length < 2000) {
      const url = new URL('https://onesignal.com/api/v1/players');
      url.searchParams.set('app_id', this.oneSignalAppId);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));

      const res = await fetch(url, {
        headers: {
          Authorization: `Key ${this.oneSignalRestApiKey}`,
        },
      });
      const raw = await res.text();
      let parsed: any = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok || !parsed) {
        const message =
          parsed?.errors?.[0] ||
          parsed?.error ||
          parsed?.message ||
          raw.slice(0, 160) ||
          `OneSignal players failed (${res.status})`;
        throw new Error(String(message));
      }

      const players: OneSignalPlayer[] = Array.isArray(parsed.players)
        ? parsed.players
        : [];
      totalCount =
        typeof parsed.total_count === 'number'
          ? parsed.total_count
          : totalCount;

      ids.push(
        ...players
          .map((player) => (player.id || '').trim())
          .filter((id) => id.length > 0),
      );

      if (!players.length || players.length < limit) break;
      offset += limit;
      if (totalCount !== undefined && offset >= totalCount) break;
    }

    return ids.slice(0, 2000);
  }
}
