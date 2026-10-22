import { APP_NOTIFICATION_KIND } from '../common/app-notifications';
import { MonthlyAwardsService, previousSeason } from './monthly_awards.service';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly monthlyAwards: MonthlyAwardsService,
  ) {}

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
      ttl: 86400,
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
    const inbox = await this.prisma.timelineEvent.create({
      data: {
        kind: APP_NOTIFICATION_KIND,
        meta: {
          notificationType: 'season_reset',
          titleAr: 'انتهى السيزن الشهري',
          messageAr:
            'انتهى السيزن ورجعت اللآلئ إلى ٥. الليدربورد بدأ من جديد، والمستويات محفوظة.',
          data: {
            type: 'season_reset',
            seasonYm: ym,
            resetPearls: RESET_PEARLS,
          },
        },
      },
      select: { id: true },
    });
    return this.sendBroadcast({
      titleAr: 'انتهى السيزن الشهري',
      messageAr:
        'انتهى السيزن ورجعت اللآلئ إلى ٥. الليدربورد بدأ من جديد، والتصنيفات محفوظة.',
      titleEn: 'Monthly season ended',
      messageEn:
        'The season ended and pearls are back to 5. Leaderboards restarted, and badges are saved.',
      data: {
        inAppNotificationId: inbox.id,
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
        // A previous push failure must remain retryable after a successful reset.
        const monthlyAwards =
          !dryRun && sendPush
            ? await this.monthlyAwards.dispatch({
                seasonYm: previousSeason(ym),
              })
            : undefined;
        return {
          monthlyAwards,
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

          // Finalize the completed month before resetting wallets for the new one.
          const leaderSnapshots = await this.monthlyAwards.capture(
            tx,
            previousSeason(ym),
          );

          const [
            users,
            userGameWallets,
            sponsorGameWallets,
            dewanyahGameWallets,
          ] = await Promise.all([
            tx.user.updateMany({
              // Preserve points already earned after a lazy new-month reset.
              where: force
                ? {}
                : {
                    OR: [
                      { pearlsSeasonYm: null },
                      { pearlsSeasonYm: { not: ym } },
                    ],
                  },
              data: {
                pearls: RESET_PEARLS,
                creditPoints: RESET_PEARLS,
                pearlsSeasonYm: ym,
              },
            }),
            tx.userGameWallet.updateMany({
              // Preserve points already earned after a lazy new-month reset.
              where: force
                ? {}
                : { OR: [{ seasonYm: null }, { seasonYm: { not: ym } }] },
              data: {
                pearls: RESET_PEARLS,
                badgeScore: RESET_PEARLS,
                badgeLossCount: 0,
                seasonYm: ym,
              },
            }),
            tx.sponsorGameWallet.updateMany({
              // Preserve points already earned after a lazy new-month reset.
              where: force
                ? {}
                : { OR: [{ seasonYm: null }, { seasonYm: { not: ym } }] },
              data: {
                pearls: RESET_PEARLS,
                badgeScore: RESET_PEARLS,
                badgeLossCount: 0,
                seasonYm: ym,
              },
            }),
            tx.dewanyahGameWallet.updateMany({
              // Preserve points already earned after a lazy new-month reset.
              where: force
                ? {}
                : { OR: [{ seasonYm: null }, { seasonYm: { not: ym } }] },
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
        {
          timeout: 60_000,
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        },
      );

      const monthlyAwards = sendPush
        ? await this.monthlyAwards.dispatch({ seasonYm: previousSeason(ym) })
        : undefined;
      const push = sendPush ? await this.sendSeasonEndedNotice() : undefined;
      return { skipped: false, ...result, push, monthlyAwards };
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
