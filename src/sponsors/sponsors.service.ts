import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SponsorsService {
  constructor(private prisma: PrismaService) {}

  async listSponsors() {
    return this.prisma.sponsor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { code: true, name: true, active: true },
    });
  }

  // Admin list with games
  async listSponsorsWithGames() {
    return this.prisma.sponsor.findMany({
      orderBy: { name: 'asc' },
      include: {
        SponsorGame: { select: { gameId: true, prizeAmount: true } },
      },
    });
  }

  // Admin: create sponsor
  async createSponsor(code: string, name: string) {
    return this.prisma.sponsor.upsert({
      where: { code },
      update: { name, active: true },
      create: { code, name, active: true },
    });
  }

  async updateSponsor(code: string, data: { name?: string; imageUrl?: string; themePrimary?: string; themeAccent?: string }) {
    return this.prisma.sponsor.update({
      where: { code },
      data: data as any,
    });
  }

  async deleteSponsor(code: string) {
    return this.prisma.sponsor.delete({ where: { code } });
  }

  // Admin: add game to sponsor with optional prize
  async addGameToSponsor(code: string, gameId: string, prizeAmount?: number) {
    // ensure game exists
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('GAME_NOT_FOUND');

    await this.prisma.sponsor.upsert({
      where: { code },
      update: {},
      create: { code, name: code, active: true },
    });

    return this.prisma.sponsorGame.upsert({
      where: { sponsorCode_gameId: { sponsorCode: code, gameId } },
      update: { prizeAmount },
      create: { sponsorCode: code, gameId, prizeAmount },
    });
  }

  // Returns { sponsor, games } with prizeAmount
  async getSponsorWithGames(code: string) {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code },
      select: { code: true, name: true, active: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');

    const games = await this.prisma.sponsorGame.findMany({
      where: { sponsorCode: code },
      include: {
        game: { select: { id: true, name: true, category: true } },
      },
      orderBy: { gameId: 'asc' },
    });

    return { sponsor, games };
  }

  // ✅ Called by POST /sponsors/:code/join
  // Seed wallets with 5 pearls per game supported by sponsor
  async joinSponsor(userId: string, sponsorCode: string) {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, active: true },
    });
    if (!sponsor || !sponsor.active) throw new NotFoundException('SPONSOR_NOT_FOUND');

    // ensure relation (UserSponsor)
    await this.prisma.userSponsor.upsert({
      where: { userId_sponsorCode: { userId, sponsorCode } },
      update: {},
      create: { userId, sponsorCode },
    });

    // seed wallets for all sponsor games
    const sponsorGames = await this.prisma.sponsorGame.findMany({
      where: { sponsorCode },
      select: { gameId: true },
    });

    // create wallets if missing
    await this.prisma.$transaction(
      sponsorGames.map((g) =>
        this.prisma.sponsorGameWallet.upsert({
          where: {
            userId_sponsorCode_gameId: {
              userId,
              sponsorCode,
              gameId: g.gameId,
            },
          },
          update: {},
          create: {
            userId,
            sponsorCode,
            gameId: g.gameId,
            pearls: 5,
          },
        }),
      ),
    );

    return { sponsorCode };
  }

  async userWallets(userId: string, sponsorCode: string) {
    // ensure sponsor exists
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, active: true },
    });
    if (!sponsor || !sponsor.active) throw new NotFoundException('SPONSOR_NOT_FOUND');

    // ensure relation + wallets (same seeding as joinSponsor)
    await this.prisma.userSponsor.upsert({
      where: { userId_sponsorCode: { userId, sponsorCode } },
      update: {},
      create: { userId, sponsorCode },
    });
    const sponsorGames = await this.prisma.sponsorGame.findMany({
      where: { sponsorCode },
      select: { gameId: true },
    });
    await this.prisma.$transaction(
      sponsorGames.map((g) =>
        this.prisma.sponsorGameWallet.upsert({
          where: {
            userId_sponsorCode_gameId: {
              userId,
              sponsorCode,
              gameId: g.gameId,
            },
          },
          update: {},
          create: { userId, sponsorCode, gameId: g.gameId, pearls: 5 },
        }),
      ),
    );

    // return wallets with game info
    return this.prisma.sponsorGameWallet.findMany({
      where: { userId, sponsorCode },
      include: {
        game: { select: { id: true, name: true, category: true } },
      },
      orderBy: { gameId: 'asc' },
    });
  }

  async userAllWallets(userId: string) {
    return this.prisma.sponsorGameWallet.findMany({
      where: { userId },
      include: {
        sponsor: { select: { code: true, name: true } },
        game: { select: { id: true, name: true } },
      },
      orderBy: [{ sponsorCode: 'asc' }, { gameId: 'asc' }],
    });
  }

  // ✅ NEW: list sponsor games with prizeAmount (clean payload for Flutter)
  async sponsorGames(sponsorCode: string) {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');

    const games = await this.prisma.sponsorGame.findMany({
      where: { sponsorCode },
      include: { game: { select: { id: true, name: true, category: true } } },
      orderBy: { gameId: 'asc' },
    });

    // Normalize shape for Flutter:
    // { sponsorCode, gameId, prizeAmount, game: {id,name,category} }
    return games.map((g) => ({
      sponsorCode: g.sponsorCode,
      gameId: g.gameId,
      prizeAmount: g.prizeAmount ?? 0,
      game: g.game,
    }));
  }

  // ✅ NEW: leaderboard per sponsor+game
  // - pearls: from SponsorGameWallet
  // - wins/losses: from MatchParticipant within sponsor scope and gameId
  // - streak: computed (simple recent streak from last N matches)
  async sponsorGameLeaderboard(args: {
    sponsorCode: string;
    gameId: string;
    limit: number;
  }) {
    const { sponsorCode, gameId, limit } = args;

    // Ensure sponsor & game exist (optional strictness)
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, name: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');

    // Base: wallets = who is active in this sponsor game
    const wallets = await this.prisma.sponsorGameWallet.findMany({
      where: { sponsorCode, gameId },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    const userIds = wallets.map((w) => w.userId);

    // Aggregate wins/losses from matches for those users
    // We count outcomes where Match.sponsorCode=sponsorCode and Match.gameId=gameId
    const parts = await this.prisma.matchParticipant.findMany({
      where: {
        userId: { in: userIds },
        match: { sponsorCode, gameId },
      },
      select: {
        userId: true,
        outcome: true,
        match: { select: { createdAt: true } },
      },
      orderBy: { match: { createdAt: 'desc' } },
      take: 4000, // enough for streak calc
    });

    // Build stats
    const stats = new Map<
      string,
      { wins: number; losses: number; recent: Array<'WIN' | 'LOSS'> }
    >();

    for (const uid of userIds) {
      stats.set(uid, { wins: 0, losses: 0, recent: [] });
    }

    for (const p of parts) {
      const s = stats.get(p.userId);
      if (!s) continue;
      if (p.outcome === 'WIN') s.wins += 1;
      else s.losses += 1;

      // recent streak (keep last 10 outcomes)
      if (s.recent.length < 10) s.recent.push(p.outcome);
    }

    // streak: number of consecutive WIN from most recent
    const computeStreak = (recent: Array<'WIN' | 'LOSS'>) => {
      let k = 0;
      for (const r of recent) {
        if (r === 'WIN') k += 1;
        else break;
      }
      return k;
    };

    return {
      sponsor,
      gameId,
      rows: wallets.map((w, idx) => {
        const s = stats.get(w.userId) ?? { wins: 0, losses: 0, recent: [] };
        const streak = computeStreak(s.recent);
        return {
          rank: idx + 1,
          userId: w.userId,
          displayName: w.user?.displayName ?? '',
          email: w.user?.email ?? '',
          pearls: w.pearls ?? 0,
          wins: s.wins,
          losses: s.losses,
          streak,
          fire: streak >= 3, // 🔥 show fire if streak >= 3
        };
      }),
    };
  }
}
