import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';
import { err, ok } from '../common/api';
import { PrismaService } from '../prisma.service';
import { seasonRange } from '../common/badges';
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

    const result = await this.seasonReset.sendBroadcast({
      titleAr,
      messageAr,
      titleEn,
      messageEn,
      data: {
        type: 'admin_broadcast',
        ...(body?.data ?? {}),
      },
    });

    if (!result.sent) {
      return err(result.error || 'Push failed', 'ONESIGNAL_SEND_FAILED');
    }

    return ok('Broadcast sent', result.response ?? result);
  }

  @Post('season-ended')
  async seasonEndedNotice() {
    const result = await this.seasonReset.sendSeasonEndedNotice();
    if (!result.sent) {
      return err(result.error || 'Push failed', 'ONESIGNAL_SEND_FAILED');
    }
    return ok('Season ended notification sent', result.response ?? result);
  }

  @Post('season-reset')
  async seasonResetNow(@Body() body: SeasonResetBody) {
    const result = await this.seasonReset.runMonthlySeasonReset({
      dryRun: body?.dryRun === true,
      force: body?.force === true,
      sendPush: body?.sendPush !== false,
      source: 'admin',
    });
    return ok('Season reset handled', result);
  }

  @Post('monthly-leaderboards')
  async monthlyLeaderboards(@Body() body: MonthlyLeaderboardBody) {
    if (!this.oneSignalAppId || !this.oneSignalRestApiKey) {
      return err('Missing OneSignal env', 'ONESIGNAL_ENV_MISSING');
    }

    const seasonYm = this.normalizeSeasonYm(body?.seasonYm);
    const limit = Math.min(Math.max(Number(body?.limit ?? 10), 1), 10);
    const dryRun = body?.dryRun === true;
    const range = seasonRange(seasonYm);
    const nextRange = seasonRange(this.nextSeasonYm(seasonYm));
    const games = await this.prisma.game.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    const awards: Array<{
      userId: string;
      displayName: string;
      gameId: string;
      gameName: string;
      rank: number;
      rankLabelAr: string;
      wins: number;
      losses: number;
      score: number;
    }> = [];

    for (const game of games) {
      const parts = await this.prisma.matchParticipant.findMany({
        where: {
          outcome: { in: ['WIN', 'LOSS'] },
          user: { hideFromLeaderboard: false },
          match: {
            gameId: game.id,
            createdAt: { gte: range.gte, lt: range.lt },
          },
        },
        select: {
          userId: true,
          outcome: true,
          user: { select: { displayName: true } },
          match: { select: { createdAt: true } },
        },
      });

      const stats = new Map<
        string,
        {
          displayName: string;
          wins: number;
          losses: number;
          lastPlayedAt: Date;
        }
      >();

      for (const p of parts) {
        const current = stats.get(p.userId) ?? {
          displayName: p.user.displayName,
          wins: 0,
          losses: 0,
          lastPlayedAt: new Date(0),
        };
        if (p.outcome === 'WIN') current.wins += 1;
        if (p.outcome === 'LOSS') current.losses += 1;
        if (p.match.createdAt > current.lastPlayedAt) {
          current.lastPlayedAt = p.match.createdAt;
        }
        stats.set(p.userId, current);
      }

      const rows = Array.from(stats.entries())
        .map(([userId, s]) => ({
          userId,
          displayName: s.displayName,
          wins: s.wins,
          losses: s.losses,
          score: Math.max(0, 5 + s.wins - s.losses),
          lastPlayedAt: s.lastPlayedAt,
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.wins !== a.wins) return b.wins - a.wins;
          const byDate = b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime();
          if (byDate !== 0) return byDate;
          return a.displayName.localeCompare(b.displayName, 'ar');
        })
        .slice(0, limit);

      rows.forEach((row, index) => {
        const rank = index + 1;
        awards.push({
          userId: row.userId,
          displayName: row.displayName,
          gameId: game.id,
          gameName: game.name || game.id,
          rank,
          rankLabelAr: this.rankLabelAr(rank),
          wins: row.wins,
          losses: row.losses,
          score: row.score,
        });
      });
    }

    if (dryRun) {
      return ok('Monthly leaderboard dry run', {
        seasonYm,
        limit,
        awards,
      });
    }

    let eventsCreated = 0;
    let eventsSkipped = 0;
    let pushesSent = 0;
    const pushErrors: string[] = [];

    for (const award of awards) {
      const existing = await this.prisma.timelineEvent.findFirst({
        where: {
          userId: award.userId,
          gameId: award.gameId,
          kind: 'SEASON_LEADERBOARD_TOP',
          createdAt: { gte: nextRange.gte, lt: nextRange.lt },
        },
        select: { id: true },
      });

      if (existing) {
        eventsSkipped += 1;
      } else {
        await this.prisma.timelineEvent.create({
          data: {
            userId: award.userId,
            gameId: award.gameId,
            kind: 'SEASON_LEADERBOARD_TOP',
            meta: {
              seasonYm,
              scope: 'GENERAL',
              scopeLabelAr: 'العام',
              gameName: award.gameName,
              rank: award.rank,
              rankLabelAr: award.rankLabelAr,
              achievementAr: `${award.rankLabelAr} هذا الشهر`,
              wins: award.wins,
              losses: award.losses,
              score: award.score,
            },
          },
        });
        eventsCreated += 1;
      }

      try {
        const sent = await this.sendTargetedPush({
          userId: award.userId,
          titleAr: `مبروك ${award.rankLabelAr}!`,
          messageAr: `كنت ${award.rankLabelAr} في ليدربورد ${award.gameName} لهذا الشهر.`,
          data: {
            type: 'monthly_leaderboard_award',
            seasonYm,
            gameId: award.gameId,
            rank: award.rank,
          },
        });
        if (sent) pushesSent += 1;
      } catch (e: any) {
        pushErrors.push(`${award.userId}:${e?.message || e}`);
      }
    }

    return ok('Monthly leaderboard awards sent', {
      seasonYm,
      limit,
      awards: awards.length,
      eventsCreated,
      eventsSkipped,
      pushesSent,
      pushErrors,
    });
  }

  private normalizeSeasonYm(value?: number) {
    if (value && Number.isFinite(value)) return Number(value);
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return previousMonth.getFullYear() * 100 + previousMonth.getMonth() + 1;
  }

  private nextSeasonYm(ym: number) {
    const year = Math.floor(ym / 100);
    const month = ym % 100;
    const next = new Date(year, month, 1);
    return next.getFullYear() * 100 + next.getMonth() + 1;
  }

  private rankLabelAr(rank: number) {
    if (rank === 1) return 'الأول';
    if (rank === 2) return 'الثاني';
    if (rank === 3) return 'الثالث';
    if (rank === 4) return 'الرابع';
    if (rank === 5) return 'الخامس';
    if (rank === 6) return 'السادس';
    if (rank === 7) return 'السابع';
    if (rank === 8) return 'الثامن';
    if (rank === 9) return 'التاسع';
    if (rank === 10) return 'العاشر';
    return `المركز ${rank}`;
  }

  private async sendTargetedPush(params: {
    userId: string;
    titleAr: string;
    messageAr: string;
    data: Record<string, unknown>;
  }) {
    const payload = {
      app_id: this.oneSignalAppId,
      target_channel: 'push',
      include_aliases: { external_id: [params.userId] },
      headings: { ar: params.titleAr, en: params.titleAr },
      contents: { ar: params.messageAr, en: params.messageAr },
      data: params.data,
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${this.oneSignalRestApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`OneSignal failed (${res.status}): ${raw.slice(0, 200)}`);
    }

    return true;
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
