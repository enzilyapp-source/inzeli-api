import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import {
  APP_NOTIFICATION_KIND,
  AppNotificationMeta,
} from '../common/app-notifications';
import { err, ok } from '../common/api';
import { PrismaService } from '../prisma.service';
import { MonthlyAwardsService } from './monthly_awards.service';
import { SeasonResetService } from './season_reset.service';

type BroadcastBody = {
  titleAr?: string;
  messageAr?: string;
  title?: string;
  message?: string;
  data?: Record<string, unknown>;
};

type MonthlyLeaderboardBody = {
  seasonYm?: number;
  limit?: number;
  dryRun?: boolean;
};

type SeasonResetBody = {
  dryRun?: boolean;
  force?: boolean;
  sendPush?: boolean;
};

@Controller('admin/notifications')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminUsersNotificationsController {
  private readonly oneSignalAppId = process.env.ONESIGNAL_APP_ID || '';
  private readonly oneSignalRestApiKey =
    process.env.ONESIGNAL_REST_API_KEY || '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasonReset: SeasonResetService,
    private readonly monthlyAwards: MonthlyAwardsService,
  ) {}

  @Get('status')
  async status() {
    const audience = await this.oneSignalAudienceSnapshot();
    return ok('OneSignal status', {
      appIdConfigured: Boolean(this.oneSignalAppId),
      restApiKeyConfigured: Boolean(this.oneSignalRestApiKey),
      appId: this.oneSignalAppId
        ? `${this.oneSignalAppId.slice(0, 8)}...${this.oneSignalAppId.slice(-4)}`
        : null,
      targetSegment: 'Subscribed Users',
      audience,
    });
  }

  @Post('broadcast')
  async broadcast(@Body() body: BroadcastBody) {
    const titleAr = (body?.titleAr || '').trim();
    const messageAr = (body?.messageAr || '').trim();
    const titleEn = (body?.title || titleAr || '').trim();
    const messageEn = (body?.message || messageAr || '').trim();

    if (!titleAr || !messageAr) {
      return err('Missing title or message', 'MISSING_FIELDS');
    }

    const inAppNotification = await this.createInAppNotification({
      type: 'admin_broadcast',
      titleAr,
      messageAr,
      titleEn,
      messageEn,
      data: { ...(body?.data ?? {}), type: 'admin_broadcast' },
    });
    const result = await this.seasonReset.sendBroadcast({
      titleAr,
      messageAr,
      titleEn,
      messageEn,
      data: {
        ...(body?.data ?? {}),
        type: 'admin_broadcast',
        inAppNotificationId: inAppNotification.id,
        createdAt: inAppNotification.createdAt.toISOString(),
      },
    });

    return ok('Broadcast sent', {
      push: result.sent ? (result.response ?? result) : result,
      inAppNotificationId: inAppNotification.id,
    });
  }

  @Post('season-ended')
  async seasonEndedNotice() {
    return ok(
      'Season ended notification',
      await this.seasonReset.sendSeasonEndedNotice(),
    );
  }

  @Post('season-reset')
  async seasonResetNow(@Body() body: SeasonResetBody) {
    return ok(
      'Season reset handled',
      await this.seasonReset.runMonthlySeasonReset({
        dryRun: body?.dryRun === true,
        force: body?.force === true,
        sendPush: body?.sendPush !== false,
        source: 'admin',
      }),
    );
  }

  @Post('monthly-leaderboards')
  async monthlyLeaderboards(@Body() body: MonthlyLeaderboardBody) {
    return ok(
      'Monthly leaderboard awards',
      await this.monthlyAwards.dispatch(body),
    );
  }

  private async createInAppNotification(params: {
    userId?: string;
    gameId?: string;
    type: string;
    titleAr: string;
    messageAr: string;
    titleEn?: string;
    messageEn?: string;
    data?: Record<string, unknown>;
  }) {
    const meta: AppNotificationMeta = {
      notificationType: params.type,
      titleAr: params.titleAr,
      messageAr: params.messageAr,
      titleEn: params.titleEn,
      messageEn: params.messageEn,
      data: params.data ?? {},
      source: 'admin_notifications',
    };

    return this.prisma.timelineEvent.create({
      data: {
        userId: params.userId ?? null,
        gameId: params.gameId ?? null,
        kind: APP_NOTIFICATION_KIND,
        meta: meta as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
  }

  private async oneSignalAudienceSnapshot() {
    if (!this.oneSignalAppId || !this.oneSignalRestApiKey) {
      return null;
    }

    try {
      const url = new URL('https://onesignal.com/api/v1/players');
      url.searchParams.set('app_id', this.oneSignalAppId);
      url.searchParams.set('limit', '50');
      url.searchParams.set('offset', '0');
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
        return {
          ok: false,
          error:
            parsed?.errors?.[0] ||
            parsed?.error ||
            parsed?.message ||
            raw.slice(0, 160) ||
            `OneSignal status ${res.status}`,
        };
      }

      const players = Array.isArray(parsed.players) ? parsed.players : [];
      const subscribed = players.filter(
        (player: any) => Number(player?.notification_types) > 0,
      ).length;
      const channels = players.reduce(
        (acc: Record<string, number>, player: any) => {
          const key = String(player?.device_type ?? 'unknown');
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {},
      );

      return {
        ok: true,
        totalCount: Number(parsed.total_count ?? players.length),
        sampled: players.length,
        subscribedSample: subscribed,
        unsubscribedSample: players.length - subscribed,
        channels,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }
}
