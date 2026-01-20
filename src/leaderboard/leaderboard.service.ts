import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  async globalLeaderboard(limit = 50) {
    const users = await this.prisma.user.findMany({
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
      where: { gameId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
    });

    const walletMap = new Map<string, { pearls: number; displayName: string; email: string }>();
    for (const w of wallets) {
      walletMap.set(w.userId, {
        pearls: w.pearls ?? 0,
        displayName: w.user?.displayName ?? '',
        email: w.user?.email ?? '',
      });
    }

    const everyone = await this.prisma.user.findMany({
      select: { id: true, displayName: true, email: true },
    });

    const rows = everyone.map((u) => {
      const base = walletMap.get(u.id)?.pearls;
      return {
        userId: u.id,
        displayName: u.displayName ?? '',
        email: u.email ?? '',
        pearls: base == null ? FALLBACK_PEARLS : base,
      };
    });

    rows.sort((a, b) => {
      const p = (b.pearls ?? 0) - (a.pearls ?? 0);
      if (p !== 0) return p;
      return a.displayName.localeCompare(b.displayName);
    });

    const limited = rows.slice(0, Math.max(0, limit));

    return {
      scope: 'GAME',
      gameId,
      rows: limited.map((w, i) => ({
        rank: i + 1,
        userId: w.userId,
        displayName: w.displayName,
        email: w.email,
        pearls: w.pearls ?? 0,
      })),
    };
  }

  async sponsorGameLeaderboard(sponsorCode: string, gameId: string, limit = 50) {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, name: true, active: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');
    const FALLBACK_PEARLS = 5; // الظهور الأولي بدون محفظة/مشاركة

    // 1) اجمع كل من عنده محفظة + كل من لعب مباراة لهذا السبونسر/اللعبة
    const wallets = await this.prisma.sponsorGameWallet.findMany({
      where: { sponsorCode, gameId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    const walletMap = new Map<string, { pearls: number; displayName: string; email: string }>();
    for (const w of wallets) {
      walletMap.set(w.userId, {
        pearls: w.pearls ?? 0,
        displayName: w.user?.displayName ?? '',
        email: w.user?.email ?? '',
      });
    }

    const participants = await this.prisma.matchParticipant.findMany({
      where: { match: { sponsorCode, gameId } },
      select: {
        userId: true,
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

    const rows = Array.from(users.entries()).map(([userId, info]) => ({
      userId,
      displayName: info.displayName || info.email || userId,
      email: info.email ?? '',
      pearls: info.pearls ?? 0,
    }));

    rows.sort((a, b) => {
      const p = (b.pearls ?? 0) - (a.pearls ?? 0);
      if (p !== 0) return p;
      return a.displayName.localeCompare(b.displayName);
    });

    const limited = rows.slice(0, Math.max(0, limit));

    return {
      sponsor,
      gameId,
      rows: limited.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        displayName: r.displayName,
        email: r.email,
        pearls: r.pearls ?? 0,
      })),
    };
  }
}
