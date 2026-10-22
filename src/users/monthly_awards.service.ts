import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, BadgeScope } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { seasonRange, seasonYm } from '../common/badges';
import { APP_NOTIFICATION_KIND } from '../common/app-notifications';

export function previousSeason(ym = seasonYm()) {
  return ym % 100 === 1 ? (Math.floor(ym / 100) - 1) * 100 + 12 : ym - 1;
}

/** The saved pearl balance is authoritative. Wins-losses cannot reconstruct team pots. */
@Injectable()
export class MonthlyAwardsService {
  constructor(private readonly prisma: PrismaService) {}

  async capture(tx: Prisma.TransactionClient, ym: number) {
    const range = seasonRange(ym);
    const [
      games,
      sponsors,
      dews,
      parts,
      generalCurrent,
      sponsorCurrent,
      dewCurrent,
      archives,
    ] = await Promise.all([
      tx.game.findMany({ select: { id: true } }),
      tx.sponsor.findMany({ select: { code: true, name: true } }),
      tx.dewanyah.findMany({
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          members: {
            where: { status: 'approved' },
            select: { userId: true },
          },
        },
      }),
      tx.matchParticipant.findMany({
        where: {
          match: { createdAt: range },
          user: { hideFromLeaderboard: false, isTestAccount: false },
        },
        select: {
          userId: true,
          outcome: true,
          user: { select: { displayName: true } },
          match: {
            select: {
              gameId: true,
              sponsorCode: true,
              createdAt: true,
              room: { select: { dewanyahId: true } },
            },
          },
        },
      }),
      tx.userGameWallet.findMany({
        where: { seasonYm: ym },
        select: { userId: true, gameId: true, pearls: true },
      }),
      tx.sponsorGameWallet.findMany({
        where: { seasonYm: ym },
        select: {
          userId: true,
          gameId: true,
          sponsorCode: true,
          pearls: true,
        },
      }),
      tx.dewanyahGameWallet.findMany({
        where: { seasonYm: ym },
        select: {
          userId: true,
          gameId: true,
          dewanyahId: true,
          pearls: true,
        },
      }),
      tx.timelineEvent.findMany({
        where: {
          kind: 'SEASON_WALLET_ARCHIVE',
          meta: { path: ['seasonYm'], equals: ym },
          userId: { not: null },
          gameId: { not: null },
        },
        select: { userId: true, gameId: true, meta: true },
      }),
    ]);
    const archived = archives.map((e) => {
      const meta = e.meta as Prisma.JsonObject;
      return {
        userId: e.userId!,
        gameId: e.gameId!,
        pearls: Number(meta.pearls),
        scope: String(meta.scope),
        sponsorCode: String(meta.sponsorCode ?? ''),
        dewanyahId: String(meta.dewanyahId ?? ''),
      };
    });
    const general = [
      ...archived.filter((w) => w.scope === 'GENERAL'),
      ...generalCurrent,
    ];
    const sponsor = [
      ...archived.filter((w) => w.scope === 'SPONSOR'),
      ...sponsorCurrent,
    ];
    const dew = [
      ...archived.filter((w) => w.scope === 'DEWANYAH'),
      ...dewCurrent,
    ];
    const boards = [
      ...games.map((g) => ({
        scope: 'GENERAL' as BadgeScope,
        gameId: g.id,
        key: '',
        name: 'العام',
      })),
      ...sponsor.map((w) => ({
        scope: 'SPONSOR' as BadgeScope,
        gameId: w.gameId,
        key: w.sponsorCode,
        name:
          sponsors.find((s) => s.code === w.sponsorCode)?.name ?? w.sponsorCode,
      })),
      ...dew.map((w) => ({
        scope: 'DEWANYAH' as BadgeScope,
        gameId: w.gameId,
        key: w.dewanyahId,
        name: dews.find((d) => d.id === w.dewanyahId)?.name ?? 'ديوانية',
      })),
    ];
    const seen = new Set<string>();
    let count = 0;
    for (const b of boards) {
      const boardKey = `${b.scope}:${b.key}:${b.gameId}`;
      if (seen.has(boardKey)) continue;
      seen.add(boardKey);
      const where = {
        seasonYm: ym,
        scope: b.scope,
        gameId: b.gameId,
        sponsorCode: b.scope === 'SPONSOR' ? b.key : null,
        dewanyahId: b.scope === 'DEWANYAH' ? b.key : null,
      };
      // Existing final snapshots stay immutable, including snapshots taken before deleting a board.
      if (
        await tx.monthlyLeaderboardSnapshot.findFirst({
          where: {
            ...where,
            reason: {
              in: ['monthly_final', 'sponsor_deleted', 'dewanyah_deleted'],
            },
          },
        })
      )
        continue;
      const matchingWallets =
        b.scope === 'GENERAL'
          ? general.filter((w) => w.gameId === b.gameId)
          : b.scope === 'SPONSOR'
            ? sponsor.filter(
                (w) => w.gameId === b.gameId && w.sponsorCode === b.key,
              )
            : dew.filter(
                (w) => w.gameId === b.gameId && w.dewanyahId === b.key,
              );
      const walletRows = [
        ...new Map(matchingWallets.map((w) => [w.userId, w])).values(),
      ];
      if (!walletRows.length) continue;
      const stats = new Map<
        string,
        { wins: number; losses: number; last: number; name: string }
      >();
      for (const p of parts) {
        if (p.match.gameId !== b.gameId) continue;
        if (b.scope === 'SPONSOR' && p.match.sponsorCode !== b.key) continue;
        if (b.scope === 'DEWANYAH' && p.match.room?.dewanyahId !== b.key)
          continue;
        // Match the existing general leaderboard's counts (all contexts for this game).
        const s = stats.get(p.userId) ?? {
          wins: 0,
          losses: 0,
          last: 0,
          name: p.user.displayName,
        };
        if (p.outcome === 'WIN') s.wins++;
        else s.losses++;
        s.last = Math.max(s.last, p.match.createdAt.getTime());
        stats.set(p.userId, s);
      }
      const eligible = dews.find((d) => d.id === b.key);
      const ranked = walletRows
        .filter(
          (w) =>
            stats.has(w.userId) &&
            (b.scope !== 'DEWANYAH' ||
              eligible?.ownerUserId === w.userId ||
              eligible?.members.some((m) => m.userId === w.userId)),
        )
        .map((w) => ({ ...w, ...stats.get(w.userId)! }))
        .sort(
          (a, b) =>
            b.pearls - a.pearls ||
            b.last - a.last ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 10);
      if (!ranked.length) continue;
      await tx.monthlyLeaderboardSnapshot.createMany({
        data: ranked.map((r, i) => ({
          ...where,
          rank: i + 1,
          sponsorName: b.scope === 'SPONSOR' ? b.name : null,
          dewanyahName: b.scope === 'DEWANYAH' ? b.name : null,
          leaderUserId: r.userId,
          leaderName: r.name,
          pearls: r.pearls,
          wins: r.wins,
          losses: r.losses,
          playedCount: r.wins + r.losses,
          reason: 'monthly_final',
        })),
      });
      count += ranked.length;
    }
    return count;
  }

  async dispatch(body?: {
    seasonYm?: number;
    limit?: number;
    dryRun?: boolean;
  }) {
    const ym = body?.seasonYm ?? previousSeason();
    if (
      !Number.isInteger(ym) ||
      ym < 202001 ||
      ym % 100 < 1 ||
      ym % 100 > 12 ||
      ym >= seasonYm()
    )
      throw new BadRequestException('اختر شهرًا مكتملًا بصيغة YYYYMM');
    const limit = Math.min(10, Math.max(1, Number(body?.limit) || 10));
    // Capture only when authoritative wallets still exist; never invent historical scores.
    if (!body?.dryRun)
      await this.prisma.$transaction((tx) => this.capture(tx, ym), {
        timeout: 60000,
      });
    const snapshots = await this.prisma.monthlyLeaderboardSnapshot.findMany({
      where: {
        reason: {
          in: ['monthly_final', 'sponsor_deleted', 'dewanyah_deleted'],
        },
        seasonYm: ym,
        rank: { lte: limit },
        leaderUserId: { not: null },
      },
      orderBy: [
        { scope: 'asc' },
        { gameId: 'asc' },
        { rank: 'asc' },
        { createdAt: 'desc' },
      ],
    });
    const games = new Map(
      (
        await this.prisma.game.findMany({ select: { id: true, name: true } })
      ).map((g) => [g.id, g.name]),
    );
    const seen = new Set<string>();
    const awards = snapshots.filter((s) => {
      const key = `${s.scope}:${s.sponsorCode ?? s.dewanyahId ?? ''}:${s.gameId}:${s.rank}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (body?.dryRun)
      return {
        seasonYm: ym,
        awards,
        notice:
          'المعاينة تعرض النتائج المؤرشفة. الأشهر القديمة دون أرصدة محفوظة لا يمكن إعادة بنائها بدقة.',
      };
    let eventsCreated = 0,
      eventsSkipped = 0,
      pushesSent = 0;
    const pushErrors: string[] = [];
    for (const a of awards) {
      const userId = a.leaderUserId!;
      const key = `monthly:${ym}:${a.scope}:${a.sponsorCode ?? a.dewanyahId ?? ''}:${a.gameId}:${userId}`;
      const scopeLabel =
        a.scope === 'GENERAL'
          ? 'العام'
          : a.scope === 'SPONSOR'
            ? `السبونسر ${a.sponsorName}`
            : `ديوانية ${a.dewanyahName}`;
      const title = `🏆 مبروك المركز ${a.rank} — ${games.get(a.gameId) ?? a.gameId}`;
      const message = `ليدربورد ${scopeLabel} • ${Math.floor(ym / 100)}/${ym % 100}\nالفوز: ${a.wins} | الخسارة: ${a.losses}\nإجمالي المباريات: ${a.playedCount} | اللآلئ: ${a.pearls}`;
      const data = {
        type: 'monthly_leaderboard_award',
        seasonYm: ym,
        scope: a.scope,
        sponsorCode: a.sponsorCode,
        dewanyahId: a.dewanyahId,
        gameId: a.gameId,
        rank: a.rank,
        wins: a.wins,
        losses: a.losses,
        playedCount: a.playedCount,
        pearls: a.pearls,
      };
      await this.prisma.timelineEvent.upsert({
        where: { dedupeKey: `${key}:achievement` },
        update: {},
        create: {
          dedupeKey: `${key}:achievement`,
          userId,
          gameId: a.gameId,
          kind: 'SEASON_LEADERBOARD_TOP',
          meta: {
            ...data,
            gameName: games.get(a.gameId) ?? a.gameId,
            scopeLabelAr: scopeLabel,
            rankLabelAr: `المركز ${a.rank}`,
            achievementAr: `المركز ${a.rank} — ${scopeLabel}`,
            titleAr: title,
            messageAr: message,
          },
        },
      });
      const existing = await this.prisma.timelineEvent.findUnique({
        where: { dedupeKey: key },
      });
      if (existing) eventsSkipped++;
      else eventsCreated++;
      const event = await this.prisma.timelineEvent.upsert({
        where: { dedupeKey: key },
        update: {},
        create: {
          dedupeKey: key,
          userId,
          gameId: a.gameId,
          kind: APP_NOTIFICATION_KIND,
          meta: {
            notificationType: data.type,
            titleAr: title,
            messageAr: message,
            data,
            source: 'monthly_awards',
            pushSent: false,
          },
        },
      });
      if ((event.meta as any)?.pushSent) continue;
      try {
        const appId = process.env.ONESIGNAL_APP_ID,
          apiKey = process.env.ONESIGNAL_REST_API_KEY;
        if (!appId || !apiKey) throw new Error('ONESIGNAL_ENV_MISSING');
        const hash = createHash('sha256').update(key).digest('hex');
        const idempotencyKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        const res = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${apiKey}`,
          },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            app_id: appId,
            target_channel: 'push',
            include_aliases: { external_id: [userId] },
            headings: { ar: title, en: title },
            contents: { ar: message, en: message },
            data: {
              ...data,
              recipientUserId: userId,
              inAppNotificationId: event.id,
              createdAt: event.createdAt.toISOString(),
            },
            ttl: 86400,
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
            idempotency_key: idempotencyKey,
          }),
        });
        const result = (await res.json()) as any;
        if (!res.ok || !result?.id)
          throw new Error(`Push not created (${res.status})`);
        await this.prisma.timelineEvent.update({
          where: { id: event.id },
          data: {
            meta: { ...(event.meta as Prisma.JsonObject), pushSent: true },
          },
        });
        pushesSent++;
      } catch (e: any) {
        pushErrors.push(`${key}: ${e.message}`);
      }
    }
    return {
      seasonYm: ym,
      awards: awards.length,
      eventsCreated,
      eventsSkipped,
      pushesSent,
      pushErrors,
      notice: awards.length
        ? undefined
        : 'لا توجد نتائج شهرية مؤرشفة لهذا الشهر؛ لم يتم تقدير نتائج غير محفوظة.',
    };
  }
}
