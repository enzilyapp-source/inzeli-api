import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  awardBadgesForBalance,
  badgeContext,
  seasonRange,
  seasonYm,
} from '../common/badges';
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
  notification_types?: number | string | null;
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

      const preview = await this.previewResetCounts(ym);
      if (dryRun) {
        return { dryRun: true, seasonYm: ym, ...preview };
      }

      const result = await this.prisma.$transaction(
        async (tx) => {
          let badgeAwards = 0;
          const earnedAt = new Date();

          const userWallets = await tx.userGameWallet.findMany({
            where: { pearls: { gt: RESET_PEARLS } },
            select: {
              userId: true,
              gameId: true,
              pearls: true,
              seasonYm: true,
            },
          });
          for (const wallet of userWallets) {
            badgeAwards += await awardBadgesForBalance(tx, {
              userId: wallet.userId,
              balance: wallet.pearls,
              seasonYm: wallet.seasonYm ?? ym,
              earnedAt,
              context: badgeContext({ gameId: wallet.gameId }),
            });
          }

          const sponsorWallets = await tx.sponsorGameWallet.findMany({
            where: { pearls: { gt: RESET_PEARLS } },
            select: {
              userId: true,
              sponsorCode: true,
              gameId: true,
              pearls: true,
              seasonYm: true,
            },
          });
          for (const wallet of sponsorWallets) {
            badgeAwards += await awardBadgesForBalance(tx, {
              userId: wallet.userId,
              balance: wallet.pearls,
              seasonYm: wallet.seasonYm ?? ym,
              earnedAt,
              context: badgeContext({
                gameId: wallet.gameId,
                sponsorCode: wallet.sponsorCode,
              }),
            });
          }

          const dewanyahWallets = await tx.dewanyahGameWallet.findMany({
            where: { pearls: { gt: RESET_PEARLS } },
            select: {
              userId: true,
              dewanyahId: true,
              gameId: true,
              pearls: true,
              seasonYm: true,
            },
          });
          for (const wallet of dewanyahWallets) {
            badgeAwards += await awardBadgesForBalance(tx, {
              userId: wallet.userId,
              balance: wallet.pearls,
              seasonYm: wallet.seasonYm ?? ym,
              earnedAt,
              context: badgeContext({
                gameId: wallet.gameId,
                dewanyahId: wallet.dewanyahId,
              }),
            });
          }

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
              data: { pearls: RESET_PEARLS, seasonYm: ym },
            }),
            tx.sponsorGameWallet.updateMany({
              data: { pearls: RESET_PEARLS, seasonYm: ym },
            }),
            tx.dewanyahGameWallet.updateMany({
              data: { pearls: RESET_PEARLS, seasonYm: ym },
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

  private async previewResetCounts(ym: number) {
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
          OR: [{ pearls: { not: RESET_PEARLS } }, { seasonYm: { not: ym } }],
        },
      }),
      this.prisma.sponsorGameWallet.count(),
      this.prisma.sponsorGameWallet.count({
        where: {
          OR: [{ pearls: { not: RESET_PEARLS } }, { seasonYm: { not: ym } }],
        },
      }),
      this.prisma.dewanyahGameWallet.count(),
      this.prisma.dewanyahGameWallet.count({
        where: {
          OR: [{ pearls: { not: RESET_PEARLS } }, { seasonYm: { not: ym } }],
        },
      }),
      Promise.all([
        this.prisma.userGameWallet.count({
          where: { pearls: { gt: RESET_PEARLS } },
        }),
        this.prisma.sponsorGameWallet.count({
          where: { pearls: { gt: RESET_PEARLS } },
        }),
        this.prisma.dewanyahGameWallet.count({
          where: { pearls: { gt: RESET_PEARLS } },
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
      const subscriptionIds = await this.listSubscribedOneSignalPlayers();
      if (!subscriptionIds.length) {
        return {
          sent: false,
          error:
            'ONESIGNAL_NO_SUBSCRIBED_PLAYERS. Check that ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY belong to the same OneSignal app that has subscribed devices.',
          response: firstResult.response,
        };
      }

      const payload = {
        ...originalPayload,
        include_subscription_ids: subscriptionIds,
      };
      delete (payload as any).included_segments;

      const result = await this.sendOneSignal(payload);
      if (result.sent && result.response && typeof result.response === 'object') {
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

  private async listSubscribedOneSignalPlayers() {
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

      for (const player of players) {
        const id = (player.id || '').trim();
        if (!id) continue;
        if (Number(player.notification_types) > 0) ids.push(id);
      }

      if (!players.length || players.length < limit) break;
      offset += limit;
      if (totalCount !== undefined && offset >= totalCount) break;
    }

    return ids.slice(0, 2000);
  }
}
