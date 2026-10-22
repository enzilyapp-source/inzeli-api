import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { ok } from '../common/api';
import { PrismaService } from '../prisma.service';

/** Calendar months are explicitly Kuwait time (UTC+3), independent of server timezone. */
export function reportMonth(value?: string) {
  const now = new Date(Date.now() + 3 * 3600000);
  const month =
    value ||
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new BadRequestException('Use YYYY-MM');
  const [y, m] = month.split('-').map(Number);
  if (y < 2020 || y > 2100) throw new BadRequestException('Invalid year');
  return {
    month,
    gte: new Date(Date.UTC(y, m - 1, 1) - 3 * 3600000),
    lt: new Date(Date.UTC(y, m, 1) - 3 * 3600000),
    ym: y * 100 + m,
  };
}

@Controller('admin/reports')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('monthly')
  async monthly(
    @Query('month') month?: string,
    @Query('includeTests') includeTests?: string,
  ) {
    const range = reportMonth(month);
    const where: Prisma.UserWhereInput =
      includeTests === 'true' ? {} : { isTestAccount: false };
    // One repeatable-read snapshot keeps totals and rows consistent while users play.
    const data = await this.prisma.$transaction(
      async (tx) => {
        const [
          totalAccounts,
          testAccounts,
          users,
          matches,
          parts,
          awards,
          purchases,
          placements,
        ] = await Promise.all([
          tx.user.count(),
          tx.user.count({ where: { isTestAccount: true } }),
          tx.user.findMany({
            where,
            select: {
              id: true,
              publicId: true,
              username: true,
              displayName: true,
              createdAt: true,
              isTestAccount: true,
              vipUntil: true,
              permanentScore: true,
            },
          }),
          tx.match.findMany({
            where: {
              createdAt: { gte: range.gte, lt: range.lt },
              parts: { some: { user: where } },
            },
            select: { id: true, gameId: true },
          }),
          tx.matchParticipant.findMany({
            where: {
              user: where,
              match: { createdAt: { gte: range.gte, lt: range.lt } },
            },
            select: {
              userId: true,
              outcome: true,
              match: { select: { gameId: true, createdAt: true } },
            },
          }),
          tx.userBadgeAward.findMany({
            where: { user: where, earnedAt: { gte: range.gte, lt: range.lt } },
            select: {
              userId: true,
              label: true,
              threshold: true,
              scope: true,
              gameId: true,
              sponsorCode: true,
              dewanyahId: true,
              earnedAt: true,
            },
          }),
          tx.vipPurchase.findMany({
            where: {
              ...(includeTests === 'true' ? {} : { isTestAccount: false }),
              createdAt: { gte: range.gte, lt: range.lt },
            },
            select: {
              userId: true,
              creditsCharged: true,
              createdAt: true,
              startsAt: true,
              endsAt: true,
            },
          }),
          tx.monthlyLeaderboardSnapshot.findMany({
            where: { seasonYm: range.ym },
            select: {
              leaderUserId: true,
              gameId: true,
              scope: true,
              sponsorName: true,
              dewanyahName: true,
              rank: true,
              wins: true,
              losses: true,
            },
          }),
        ]);
        const stats = new Map<
          string,
          { wins: number; losses: number; lastPlayedAt: Date | null }
        >();
        for (const p of parts) {
          const row = stats.get(p.userId) ?? {
            wins: 0,
            losses: 0,
            lastPlayedAt: null,
          };
          if (p.outcome === 'WIN') row.wins++;
          else row.losses++;
          if (!row.lastPlayedAt || p.match.createdAt > row.lastPlayedAt)
            row.lastPlayedAt = p.match.createdAt;
          stats.set(p.userId, row);
        }
        const byUser = new Map<string, typeof awards>();
        for (const award of awards)
          byUser.set(award.userId, [
            ...(byUser.get(award.userId) ?? []),
            award,
          ]);
        const rows = users
          .map((u) => {
            const s = stats.get(u.id) ?? {
              wins: 0,
              losses: 0,
              lastPlayedAt: null,
            };
            return {
              ...u,
              ...s,
              played: s.wins + s.losses,
              achievements: byUser.get(u.id) ?? [],
              subscriptionPurchases: purchases.filter((p) => p.userId === u.id),
              leaderboardPlacements: placements.filter(
                (p) => p.leaderUserId === u.id,
              ),
            };
          })
          .sort(
            (a, b) =>
              b.played - a.played ||
              a.displayName.localeCompare(b.displayName, 'ar'),
          );
        return {
          summary: {
            subscriptionPurchases: purchases.length,
            unattributedSubscriptionPurchases: purchases.filter(
              (p) => !p.userId,
            ).length,
            purchasingUsers: new Set(
              purchases.map((p) => p.userId).filter(Boolean),
            ).size,
            creditsCharged: purchases.reduce(
              (sum, p) => sum + p.creditsCharged,
              0,
            ),
            totalAccounts,
            testAccounts,
            registeredUsers: totalAccounts - testAccounts,
            includedUsers: rows.length,
            monthlyPlayers: stats.size,
            newUsers: users.filter(
              (u) => u.createdAt >= range.gte && u.createdAt < range.lt,
            ).length,
            matches: matches.length,
            participations: parts.length,
            achievements: awards.length,
            // VIP is an entitlement, not proof of a paid subscription or revenue.
            currentVipUsers: users.filter(
              (u) => u.vipUntil && u.vipUntil > new Date(),
            ).length,
          },
          games: [...new Set(matches.map((m) => m.gameId))].map((gameId) => ({
            gameId,
            matches: matches.filter((m) => m.gameId === gameId).length,
          })),
          users: rows,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return ok('Monthly report', {
      month: range.month,
      timezone: 'Asia/Kuwait',
      from: range.gte,
      until: range.lt,
      includeTests: includeTests === 'true',
      subscriptionAccountingNote:
        'شراء VIP يُخصم من رصيد التطبيق؛ لا توجد فواتير دفع نقدي موثقة. سجل الشراء الشهري يبدأ من نشر هذا التحديث؛ العمليات السابقة غير متوفرة.',
      ...data,
    });
  }
}
