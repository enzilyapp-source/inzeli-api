import { Prisma, PrismaClient } from '@prisma/client';
import { awardBadgesForBalance, badgeContext } from '../src/common/badges';

const prisma = new PrismaClient();
const RESET_PEARLS = 5;
const SEASON_CHAMPION_KIND = 'SEASON_LEADERBOARD_FIRST';
const SEASON_END_KIND = 'SEASON_END_SUMMARY';

type SeasonScope = 'GENERAL' | 'SPONSOR' | 'DEWANYAH';

type ChampionCandidate = {
  scope: SeasonScope;
  userId: string;
  gameId: string;
  pearls: number;
  displayName: string;
  sponsorCode?: string;
  dewanyahId?: string;
};

type SeasonInfo = {
  ym: number;
  start: Date;
  end: Date;
  monthNameAr: string;
  monthNameEn: string;
};

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function seasonYm(d = new Date()): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return y * 100 + m;
}

function previousSeasonInfo(d = new Date()): SeasonInfo {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const start = new Date(prev.getFullYear(), prev.getMonth(), 1);
  const end = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
  const ym = prev.getFullYear() * 100 + (prev.getMonth() + 1);
  const monthIndex = prev.getMonth();
  return {
    ym,
    start,
    end,
    monthNameAr: MONTHS_AR[monthIndex] ?? `${prev.getMonth() + 1}`,
    monthNameEn: MONTHS_EN[monthIndex] ?? `${prev.getMonth() + 1}`,
  };
}

function makeScopedKey(scope: SeasonScope, contextId: string, gameId: string) {
  return `${scope}|${contextId}|${gameId}`;
}

function addParticipant(
  map: Map<string, Set<string>>,
  scope: SeasonScope,
  contextId: string,
  gameId: string,
  userId: string,
) {
  const key = makeScopedKey(scope, contextId, gameId);
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  set.add(userId);
}

function scopeLabels(scope: SeasonScope) {
  switch (scope) {
    case 'SPONSOR':
      return { ar: 'السبونسر', en: 'Sponsor' };
    case 'DEWANYAH':
      return { ar: 'الديوانية', en: 'Dewanyah' };
    default:
      return { ar: 'العام', en: 'General' };
  }
}

function championEventKey(candidate: ChampionCandidate, seasonYmValue: number) {
  return [
    seasonYmValue,
    candidate.scope,
    candidate.gameId,
    candidate.sponsorCode ?? '',
    candidate.dewanyahId ?? '',
    candidate.userId,
  ].join('|');
}

function oneSignalAppId() {
  return (process.env.ONESIGNAL_APP_ID ?? '').trim();
}

function oneSignalApiKey() {
  return (process.env.ONESIGNAL_REST_API_KEY ?? '').trim();
}

async function sendOneSignalNotification(params: {
  recipients: string[];
  headingAr: string;
  headingEn: string;
  contentAr: string;
  contentEn: string;
  data: Record<string, unknown>;
}) {
  const appId = oneSignalAppId();
  const apiKey = oneSignalApiKey();
  if (!appId || !apiKey) return false;

  const recipients = params.recipients
    .map((x) => (x ?? '').trim())
    .filter((x) => x.length > 0);
  if (!recipients.length) return false;

  const chunkSize = 200;
  let ok = true;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize);
    try {
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          include_external_user_ids: chunk,
          channel_for_external_user_ids: 'push',
          headings: { ar: params.headingAr, en: params.headingEn },
          contents: { ar: params.contentAr, en: params.contentEn },
          data: params.data,
          ios_badgeType: 'Increase',
          ios_badgeCount: 1,
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        console.warn(
          `OneSignal season notification failed (${res.status}): ${raw.slice(0, 300)}`,
        );
        ok = false;
      }
    } catch (e: any) {
      console.warn(`OneSignal season notification error: ${e?.message || e}`);
      ok = false;
    }
  }
  return ok;
}

function pickChampion<T extends ChampionCandidate>(
  current: T | undefined,
  next: T,
): T {
  if (!current) return next;
  if (next.pearls !== current.pearls) {
    return next.pearls > current.pearls ? next : current;
  }
  return next.displayName.localeCompare(current.displayName, 'ar') < 0
    ? next
    : current;
}

async function main() {
  const nowYm = seasonYm();
  const closingSeason = previousSeasonInfo();
  console.log(
    `Resetting all pearls to ${RESET_PEARLS} (seasonYm=${nowYm}) after closing season ${closingSeason.ym}...`,
  );

  const notifications: Array<{
    recipients: string[];
    headingAr: string;
    headingEn: string;
    contentAr: string;
    contentEn: string;
    data: Record<string, unknown>;
  }> = [];

  const result = await prisma.$transaction(
    async (tx) => {
      const earnedAt = new Date();
      let badgeAwards = 0;
      let seasonChampionAwards = 0;

      const existingChampionEvents = await tx.timelineEvent.findMany({
        where: { kind: SEASON_CHAMPION_KIND },
        select: { meta: true },
      });
      const existingSeasonAwardKeys = new Set(
        existingChampionEvents
          .filter((event) => {
            const meta = event.meta as Record<string, unknown> | null;
            return Number(meta?.seasonYm ?? 0) === closingSeason.ym;
          })
          .map((event) => {
            const meta = (event.meta ?? {}) as Record<string, unknown>;
            return [
              Number(meta.seasonYm ?? 0),
              String(meta.scope ?? ''),
              String(meta.gameId ?? ''),
              String(meta.sponsorCode ?? ''),
              String(meta.dewanyahId ?? ''),
              String(meta.userId ?? ''),
            ].join('|');
          }),
      );

      const matches = await tx.match.findMany({
        where: {
          createdAt: { gte: closingSeason.start, lt: closingSeason.end },
        },
        select: {
          gameId: true,
          sponsorCode: true,
          room: { select: { dewanyahId: true } },
          parts: { select: { userId: true } },
        },
      });

      const participantScopes = new Map<string, Set<string>>();
      const seasonParticipants = new Set<string>();

      for (const match of matches) {
        const gameId = match.gameId;
        const dewanyahId = match.room?.dewanyahId ?? null;
        const sponsorCode = match.sponsorCode ?? null;
        const scope: SeasonScope = dewanyahId
          ? 'DEWANYAH'
          : sponsorCode
            ? 'SPONSOR'
            : 'GENERAL';
        const contextId =
          scope === 'DEWANYAH'
            ? dewanyahId!
            : scope === 'SPONSOR'
              ? sponsorCode!
              : 'GENERAL';
        for (const part of match.parts) {
          seasonParticipants.add(part.userId);
          addParticipant(participantScopes, scope, contextId, gameId, part.userId);
        }
      }

      if (!existingSeasonAwardKeys.size) {
        const games = await tx.game.findMany({
          select: { id: true, name: true },
        });
        const gameNameMap = new Map(games.map((g) => [g.id, g.name]));

        const userWallets = await tx.userGameWallet.findMany({
          where: { seasonYm: closingSeason.ym },
          select: {
            userId: true,
            gameId: true,
            pearls: true,
            user: { select: { displayName: true } },
          },
        });

        const sponsorWallets = await tx.sponsorGameWallet.findMany({
          where: { seasonYm: closingSeason.ym },
          select: {
            userId: true,
            sponsorCode: true,
            gameId: true,
            pearls: true,
            user: { select: { displayName: true } },
          },
        });

        const dewanyahWallets = await tx.dewanyahGameWallet.findMany({
          where: { seasonYm: closingSeason.ym },
          select: {
            userId: true,
            dewanyahId: true,
            gameId: true,
            pearls: true,
            user: { select: { displayName: true } },
          },
        });

        const topByScope = new Map<string, ChampionCandidate>();

        for (const wallet of userWallets) {
          const scopeKey = makeScopedKey('GENERAL', 'GENERAL', wallet.gameId);
          const participants = participantScopes.get(scopeKey);
          if (!participants?.has(wallet.userId)) continue;
          const candidate: ChampionCandidate = {
            scope: 'GENERAL',
            userId: wallet.userId,
            gameId: wallet.gameId,
            pearls: wallet.pearls,
            displayName: wallet.user.displayName,
          };
          topByScope.set(
            scopeKey,
            pickChampion(topByScope.get(scopeKey), candidate),
          );
        }

        for (const wallet of sponsorWallets) {
          const scopeKey = makeScopedKey(
            'SPONSOR',
            wallet.sponsorCode,
            wallet.gameId,
          );
          const participants = participantScopes.get(scopeKey);
          if (!participants?.has(wallet.userId)) continue;
          const candidate: ChampionCandidate = {
            scope: 'SPONSOR',
            userId: wallet.userId,
            sponsorCode: wallet.sponsorCode,
            gameId: wallet.gameId,
            pearls: wallet.pearls,
            displayName: wallet.user.displayName,
          };
          topByScope.set(
            scopeKey,
            pickChampion(topByScope.get(scopeKey), candidate),
          );
        }

        for (const wallet of dewanyahWallets) {
          const scopeKey = makeScopedKey(
            'DEWANYAH',
            wallet.dewanyahId,
            wallet.gameId,
          );
          const participants = participantScopes.get(scopeKey);
          if (!participants?.has(wallet.userId)) continue;
          const candidate: ChampionCandidate = {
            scope: 'DEWANYAH',
            userId: wallet.userId,
            dewanyahId: wallet.dewanyahId,
            gameId: wallet.gameId,
            pearls: wallet.pearls,
            displayName: wallet.user.displayName,
          };
          topByScope.set(
            scopeKey,
            pickChampion(topByScope.get(scopeKey), candidate),
          );
        }

        const sponsorCodes = Array.from(
          new Set(
            Array.from(topByScope.values())
              .map((x) => x.sponsorCode)
              .filter((x): x is string => !!x),
          ),
        );
        const dewanyahIds = Array.from(
          new Set(
            Array.from(topByScope.values())
              .map((x) => x.dewanyahId)
              .filter((x): x is string => !!x),
          ),
        );

        const sponsors = sponsorCodes.length
          ? await tx.sponsor.findMany({
              where: { code: { in: sponsorCodes } },
              select: { code: true, name: true },
            })
          : [];
        const dewanyahs = dewanyahIds.length
          ? await tx.dewanyah.findMany({
              where: { id: { in: dewanyahIds } },
              select: { id: true, name: true },
            })
          : [];
        const sponsorNameMap = new Map(sponsors.map((s) => [s.code, s.name]));
        const dewanyahNameMap = new Map(dewanyahs.map((d) => [d.id, d.name]));

        for (const champion of topByScope.values()) {
          const awardKey = championEventKey(champion, closingSeason.ym);
          if (existingSeasonAwardKeys.has(awardKey)) continue;

          const labels = scopeLabels(champion.scope);
          const gameName = gameNameMap.get(champion.gameId) ?? champion.gameId;
          const scopeName =
            champion.scope === 'SPONSOR'
              ? sponsorNameMap.get(champion.sponsorCode ?? '')
              : champion.scope === 'DEWANYAH'
                ? dewanyahNameMap.get(champion.dewanyahId ?? '')
                : null;

          const scopeLabelAr = scopeName
            ? `${labels.ar} ${scopeName}`
            : labels.ar;
          const scopeLabelEn = scopeName
            ? `${labels.en} ${scopeName}`
            : labels.en;

          await tx.timelineEvent.create({
            data: {
              userId: champion.userId,
              gameId: champion.gameId,
              kind: SEASON_CHAMPION_KIND,
              meta: {
                seasonYm: closingSeason.ym,
                monthNameAr: closingSeason.monthNameAr,
                monthNameEn: closingSeason.monthNameEn,
                scope: champion.scope,
                scopeLabelAr,
                scopeLabelEn,
                scopeName,
                sponsorCode: champion.sponsorCode,
                dewanyahId: champion.dewanyahId,
                userId: champion.userId,
                gameId: champion.gameId,
                pearls: champion.pearls,
                achievementAr: `الأول في ${closingSeason.monthNameAr}`,
                achievementEn: `First in ${closingSeason.monthNameEn}`,
                leaderboardAr: `ليدر بورد: ${scopeLabelAr}`,
                leaderboardEn: `Leaderboard: ${scopeLabelEn}`,
                gameName,
              } as Prisma.InputJsonValue,
              createdAt: earnedAt,
            },
          });
          seasonChampionAwards += 1;

          notifications.push({
            recipients: [champion.userId],
            headingAr: 'مبروك! أنت الأول هذا الشهر',
            headingEn: 'Congrats! You were first this month',
            contentAr: `مبروك، كنت الأول في ليدر بورد ${gameName} - ${scopeLabelAr} لشهر ${closingSeason.monthNameAr}.`,
            contentEn: `Congrats, you finished first in ${gameName} - ${scopeLabelEn} for ${closingSeason.monthNameEn}.`,
            data: {
              type: SEASON_CHAMPION_KIND,
              seasonYm: closingSeason.ym,
              gameId: champion.gameId,
              scope: champion.scope,
              sponsorCode: champion.sponsorCode,
              dewanyahId: champion.dewanyahId,
            },
          });
        }

        if (seasonParticipants.size) {
          notifications.push({
            recipients: Array.from(seasonParticipants),
            headingAr: 'انتهى السيزن الشهري',
            headingEn: 'Monthly season ended',
            contentAr: `انتهى سيزن ${closingSeason.monthNameAr}. تم تثبيت إنجازاتك وأنواطك، ورجعت اللآلئ إلى ${RESET_PEARLS}.`,
            contentEn: `${closingSeason.monthNameEn} season has ended. Your achievements and badges were saved, and pearls were reset to ${RESET_PEARLS}.`,
            data: {
              type: SEASON_END_KIND,
              seasonYm: closingSeason.ym,
            },
          });
        }
      }

      const userGameBadgeWallets = await tx.userGameWallet.findMany({
        where: { pearls: { gt: RESET_PEARLS } },
        select: { userId: true, gameId: true, pearls: true, seasonYm: true },
      });
      for (const wallet of userGameBadgeWallets) {
        badgeAwards += await awardBadgesForBalance(tx, {
          userId: wallet.userId,
          balance: wallet.pearls,
          seasonYm: wallet.seasonYm ?? nowYm,
          earnedAt,
          context: badgeContext({ gameId: wallet.gameId }),
        });
      }

      const sponsorGameBadgeWallets = await tx.sponsorGameWallet.findMany({
        where: { pearls: { gt: RESET_PEARLS } },
        select: {
          userId: true,
          sponsorCode: true,
          gameId: true,
          pearls: true,
          seasonYm: true,
        },
      });
      for (const wallet of sponsorGameBadgeWallets) {
        badgeAwards += await awardBadgesForBalance(tx, {
          userId: wallet.userId,
          balance: wallet.pearls,
          seasonYm: wallet.seasonYm ?? nowYm,
          earnedAt,
          context: badgeContext({
            gameId: wallet.gameId,
            sponsorCode: wallet.sponsorCode,
          }),
        });
      }

      const dewanyahGameBadgeWallets = await tx.dewanyahGameWallet.findMany({
        where: { pearls: { gt: RESET_PEARLS } },
        select: {
          userId: true,
          dewanyahId: true,
          gameId: true,
          pearls: true,
          seasonYm: true,
        },
      });
      for (const wallet of dewanyahGameBadgeWallets) {
        badgeAwards += await awardBadgesForBalance(tx, {
          userId: wallet.userId,
          balance: wallet.pearls,
          seasonYm: wallet.seasonYm ?? nowYm,
          earnedAt,
          context: badgeContext({
            gameId: wallet.gameId,
            dewanyahId: wallet.dewanyahId,
          }),
        });
      }

      const users = await tx.user.updateMany({
        data: {
          pearls: RESET_PEARLS,
          creditPoints: RESET_PEARLS,
          pearlsSeasonYm: nowYm,
        },
      });

      const userGameWallets = await tx.userGameWallet.updateMany({
        data: { pearls: RESET_PEARLS, seasonYm: nowYm },
      });

      const sponsorGameWallets = await tx.sponsorGameWallet.updateMany({
        data: { pearls: RESET_PEARLS, seasonYm: nowYm },
      });

      const dewanyahGameWallets = await tx.dewanyahGameWallet.updateMany({
        data: { pearls: RESET_PEARLS, seasonYm: nowYm },
      });

      return {
        users,
        userGameWallets,
        sponsorGameWallets,
        dewanyahGameWallets,
        badgeAwards,
        seasonChampionAwards,
      };
    },
    { timeout: 60_000 },
  );

  for (const notification of notifications) {
    await sendOneSignalNotification(notification);
  }

  console.log(`✓ Users updated: ${result.users.count}`);
  console.log(`✓ User game wallets updated: ${result.userGameWallets.count}`);
  console.log(
    `✓ Sponsor game wallets updated: ${result.sponsorGameWallets.count}`,
  );
  console.log(
    `✓ Dewanyah game wallets updated: ${result.dewanyahGameWallets.count}`,
  );
  console.log(`✓ Badge awards snapshotted: ${result.badgeAwards}`);
  console.log(`✓ Season first-place awards created: ${result.seasonChampionAwards}`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
