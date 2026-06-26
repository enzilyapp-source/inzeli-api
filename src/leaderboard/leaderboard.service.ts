import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  private buildMatchStats(
    participants: Array<{
      userId: string;
      outcome: unknown;
      match?: { createdAt: Date } | null;
    }>,
  ) {
    const stats = new Map<
      string,
      {
        wins: number;
        losses: number;
        playedCount: number;
        lastOutcome: 'WIN' | 'LOSS' | null;
        lastPlayedAt: Date | null;
      }
    >();

    for (const p of participants) {
      const outcome = String(p.outcome).toUpperCase();
      const playedAt = p.match?.createdAt ?? null;
      const current = stats.get(p.userId) ?? {
        wins: 0,
        losses: 0,
        playedCount: 0,
        lastOutcome: null,
        lastPlayedAt: null,
      };

      current.playedCount += 1;
      if (outcome === 'WIN') current.wins += 1;
      if (outcome === 'LOSS') current.losses += 1;
      if (
        playedAt &&
        (!current.lastPlayedAt ||
          playedAt.getTime() > current.lastPlayedAt.getTime())
      ) {
        current.lastPlayedAt = playedAt;
        current.lastOutcome =
          outcome === 'WIN' || outcome === 'LOSS' ? outcome : null;
      }
      stats.set(p.userId, current);
    }

    return stats;
  }

  private compareLeaderboardRows(
    a: {
      played: boolean;
      pearls: number;
      wins: number;
      lastPlayedAt: Date | null;
      displayName: string;
    },
    b: {
      played: boolean;
      pearls: number;
      wins: number;
      lastPlayedAt: Date | null;
      displayName: string;
    },
  ) {
    if (a.played !== b.played) return a.played ? -1 : 1;
    if (a.played && b.played) {
      const pearls = b.pearls - a.pearls;
      if (pearls !== 0) return pearls;
      const last =
        (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0);
      if (last !== 0) return last;
    }
    return a.displayName.localeCompare(b.displayName);
  }

  async globalLeaderboard(limit = 50) {
    const users = await this.prisma.user.findMany({
      where: { hideFromLeaderboard: false },
      orderBy: [{ permanentScore: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: {
        id: true,
        displayName: true,
        email: true,
        permanentScore: true,
        pearls: true,
      },
    });

    return {
      scope: 'GLOBAL',
      rows: users.map((u, i) => ({
        rank: i + 1,
        userId: u.id,
        displayName: u.displayName,
        email: u.email,
        permanentScore: u.permanentScore ?? 0,
        pearls: u.pearls ?? 0,
      })),
    };
  }

  async gameLeaderboard(gameId: string, limit = 50) {
    // ensure game exists (seed if needed)
    await this.prisma.game.upsert({
      where: { id: gameId },
      update: {},
      create: { id: gameId, name: gameId, category: 'عام' },
    });

    const FALLBACK_PEARLS = 5;

    const wallets = await this.prisma.userGameWallet.findMany({
      where: { gameId, user: { hideFromLeaderboard: false } },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
    });

    const walletMap = new Map<
      string,
      { pearls: number; displayName: string; email: string }
    >();
    for (const w of wallets) {
      walletMap.set(w.userId, {
        pearls: w.pearls ?? 0,
        displayName: w.user?.displayName ?? '',
        email: w.user?.email ?? '',
      });
    }

    const everyone = await this.prisma.user.findMany({
      where: { hideFromLeaderboard: false },
      select: { id: true, displayName: true, email: true },
    });

    const participants = await this.prisma.matchParticipant.findMany({
      where: { match: { gameId }, user: { hideFromLeaderboard: false } },
      select: {
        userId: true,
        outcome: true,
        match: { select: { createdAt: true } },
      },
      orderBy: { match: { createdAt: 'desc' } },
      take: 5000,
    });
    const stats = this.buildMatchStats(participants);

    const rows = everyone.map((u) => {
      const base = walletMap.get(u.id)?.pearls;
      const pearls = base == null ? FALLBACK_PEARLS : base;
      const s = stats.get(u.id) ?? {
        wins: 0,
        losses: 0,
        playedCount: 0,
        lastOutcome: null,
        lastPlayedAt: null,
      };
      const played = s.playedCount > 0 || pearls !== FALLBACK_PEARLS;
      return {
        userId: u.id,
        displayName: u.displayName ?? '',
        email: u.email ?? '',
        pearls,
        played,
        wins: s.wins,
        losses: s.losses,
        playedCount: s.playedCount,
        matches: s.playedCount,
        lastOutcome: s.lastOutcome,
        lastPlayedAt: s.lastPlayedAt,
      };
    });

    rows.sort((a, b) => this.compareLeaderboardRows(a, b));

    const limited = rows.slice(0, Math.max(0, limit));
    let playedRank = 0;

    return {
      scope: 'GAME',
      gameId,
      rows: limited.map((w) => {
        const rank = w.played ? ++playedRank : null;
        return {
          rank,
          rankLabel: rank == null ? '--' : String(rank),
          played: w.played,
          userId: w.userId,
          displayName: w.displayName,
          email: w.email,
          pearls: w.pearls ?? 0,
          wins: w.wins,
          losses: w.losses,
          playedCount: w.playedCount,
          matches: w.matches,
          lastOutcome: w.lastOutcome,
          lastPlayedAt: w.lastPlayedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async sponsorGameLeaderboard(
    sponsorCode: string,
    gameId: string,
    limit = 50,
  ) {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, name: true, active: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');
    const FALLBACK_PEARLS = 5; // الظهور الأولي بدون محفظة/مشاركة

    // 1) اجمع كل من عنده محفظة + كل من لعب مباراة لهذا السبونسر/اللعبة
    const wallets = await this.prisma.sponsorGameWallet.findMany({
      where: { sponsorCode, gameId, user: { hideFromLeaderboard: false } },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
    const walletMap = new Map<
      string,
      { pearls: number; displayName: string; email: string }
    >();
    for (const w of wallets) {
      walletMap.set(w.userId, {
        pearls: w.pearls ?? 0,
        displayName: w.user?.displayName ?? '',
        email: w.user?.email ?? '',
      });
    }

    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        match: { sponsorCode, gameId },
        user: { hideFromLeaderboard: false },
      },
      select: {
        userId: true,
        outcome: true,
        user: { select: { displayName: true, email: true } },
        match: { select: { createdAt: true } },
      },
      orderBy: { match: { createdAt: 'desc' } },
      take: 1000,
    });

    const users = new Map<
      string,
      { displayName: string; email: string; pearls: number }
    >();

    // add wallets
    for (const [uid, info] of walletMap.entries()) {
      users.set(uid, {
        displayName: info.displayName,
        email: info.email,
        pearls: info.pearls,
      });
    }

    // add participants (حتى لو ما عنده محفظة)
    for (const p of participants) {
      if (users.has(p.userId)) continue;
      const base = walletMap.get(p.userId)?.pearls;
      users.set(p.userId, {
        displayName: p.user?.displayName ?? '',
        email: p.user?.email ?? '',
        pearls: base == null ? FALLBACK_PEARLS : base,
      });
    }

    // add all users (حتى لو ما اشترك أو لعب) — يظهر برصيد 0
    const everyone = await this.prisma.user.findMany({
      where: { hideFromLeaderboard: false },
      select: { id: true, displayName: true, email: true },
    });
    for (const u of everyone) {
      if (users.has(u.id)) continue;
      const base = walletMap.get(u.id)?.pearls;
      users.set(u.id, {
        displayName: u.displayName ?? '',
        email: u.email ?? '',
        pearls: base == null ? FALLBACK_PEARLS : base,
      });
    }

    const stats = this.buildMatchStats(participants);

    const rows = Array.from(users.entries()).map(([userId, info]) => {
      const s = stats.get(userId) ?? {
        wins: 0,
        losses: 0,
        playedCount: 0,
        lastOutcome: null,
        lastPlayedAt: null,
      };
      const pearls = info.pearls ?? 0;
      const played = s.playedCount > 0 || pearls !== FALLBACK_PEARLS;
      return {
        userId,
        displayName: info.displayName || info.email || userId,
        email: info.email ?? '',
        pearls,
        played,
        wins: s.wins,
        losses: s.losses,
        playedCount: s.playedCount,
        matches: s.playedCount,
        lastOutcome: s.lastOutcome,
        lastPlayedAt: s.lastPlayedAt,
      };
    });

    rows.sort((a, b) => this.compareLeaderboardRows(a, b));

    const limited = rows.slice(0, Math.max(0, limit));
    let playedRank = 0;

    return {
      sponsor,
      gameId,
      rows: limited.map((r) => {
        const rank = r.played ? ++playedRank : null;
        return {
          rank,
          rankLabel: rank == null ? '--' : String(rank),
          played: r.played,
          userId: r.userId,
          displayName: r.displayName,
          email: r.email,
          pearls: r.pearls ?? 0,
          wins: r.wins,
          losses: r.losses,
          playedCount: r.playedCount,
          matches: r.matches,
          lastOutcome: r.lastOutcome,
          lastPlayedAt: r.lastPlayedAt?.toISOString() ?? null,
        };
      }),
    };
  }
}
