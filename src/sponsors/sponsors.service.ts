import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { seasonRange, seasonYm } from '../common/badges';

@Injectable()
export class SponsorsService {
  constructor(private prisma: PrismaService) {}

  private normalizeRadius(value: number | undefined) {
    if (value == null || !Number.isFinite(value)) return undefined;
    return Math.max(1, Math.trunc(value));
  }

  private locationPayload(data?: {
    locationLock?: boolean;
    radiusMeters?: number;
    anchorLat?: number;
    anchorLng?: number;
  }) {
    const payload: any = {};
    if (!data) return payload;
    if (data.locationLock !== undefined) {
      payload.locationLock = data.locationLock === true;
    }
    if (data.anchorLat !== undefined) payload.anchorLat = data.anchorLat;
    if (data.anchorLng !== undefined) payload.anchorLng = data.anchorLng;
    if (data.radiusMeters !== undefined) {
      payload.radiusMeters = this.normalizeRadius(data.radiusMeters) ?? null;
    }
    return payload;
  }

  async listSponsors() {
    return this.prisma.sponsor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        code: true,
        name: true,
        active: true,
        imageUrl: true,
        themePrimary: true,
        themeAccent: true,
        locationLock: true,
        anchorLat: true,
        anchorLng: true,
        radiusMeters: true,
      },
    });
  }

  // Admin list with games
  async listSponsorsWithGames() {
    const sponsors = await this.prisma.sponsor.findMany({
      orderBy: { name: 'asc' },
      include: {
        SponsorGame: { select: { gameId: true, prizeAmount: true } },
      },
    });

    return Promise.all(
      sponsors.map(async (s) => ({
        ...s,
        monthlyLeaders: await this.currentMonthlyLeadersForSponsor(s.code),
      })),
    );
  }

  // Admin: create sponsor
  async createSponsor(
    code: string,
    name: string,
    data?: {
      imageUrl?: string;
      themePrimary?: string;
      themeAccent?: string;
      locationLock?: boolean;
      radiusMeters?: number;
      anchorLat?: number;
      anchorLng?: number;
    },
  ) {
    if (
      data?.locationLock === true &&
      (data.anchorLat == null || data.anchorLng == null)
    ) {
      throw new BadRequestException('SPONSOR_LOCATION_REQUIRED');
    }
    const basePayload = {
      name,
      active: true,
    };
    const createPayload = {
      ...basePayload,
      imageUrl: data?.imageUrl?.trim() || null,
      themePrimary: data?.themePrimary?.trim() || null,
      themeAccent: data?.themeAccent?.trim() || null,
      ...this.locationPayload(data),
    };
    const updatePayload: any = { ...basePayload };
    if (data?.imageUrl !== undefined)
      updatePayload.imageUrl = data.imageUrl.trim() || null;
    if (data?.themePrimary !== undefined)
      updatePayload.themePrimary = data.themePrimary.trim() || null;
    if (data?.themeAccent !== undefined)
      updatePayload.themeAccent = data.themeAccent.trim() || null;
    Object.assign(updatePayload, this.locationPayload(data));

    return this.prisma.sponsor.upsert({
      where: { code },
      update: updatePayload,
      create: { code, ...createPayload },
    });
  }

  async updateSponsor(
    code: string,
    data: {
      name?: string;
      imageUrl?: string;
      themePrimary?: string;
      themeAccent?: string;
      locationLock?: boolean;
      radiusMeters?: number;
      anchorLat?: number;
      anchorLng?: number;
    },
  ) {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.imageUrl !== undefined)
      payload.imageUrl = data.imageUrl.trim() || null;
    if (data.themePrimary !== undefined)
      payload.themePrimary = data.themePrimary.trim() || null;
    if (data.themeAccent !== undefined)
      payload.themeAccent = data.themeAccent.trim() || null;
    Object.assign(payload, this.locationPayload(data));

    if (data.locationLock === true) {
      const current = await this.prisma.sponsor.findUnique({
        where: { code },
        select: { anchorLat: true, anchorLng: true },
      });
      const lat = data.anchorLat ?? current?.anchorLat;
      const lng = data.anchorLng ?? current?.anchorLng;
      if (lat == null || lng == null) {
        throw new BadRequestException('SPONSOR_LOCATION_REQUIRED');
      }
    }

    return this.prisma.sponsor.update({
      where: { code },
      data: payload,
    });
  }

  async deleteSponsor(code: string) {
    await this.snapshotSponsorMonthlyLeaders(code, 'sponsor_deleted');
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
      select: {
        code: true,
        name: true,
        active: true,
        imageUrl: true,
        themePrimary: true,
        themeAccent: true,
        locationLock: true,
        anchorLat: true,
        anchorLng: true,
        radiusMeters: true,
      },
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
    if (!sponsor || !sponsor.active)
      throw new NotFoundException('SPONSOR_NOT_FOUND');

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
    if (!sponsor || !sponsor.active)
      throw new NotFoundException('SPONSOR_NOT_FOUND');

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

  async currentMonthlyLeadersForSponsor(sponsorCode: string) {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: {
        code: true,
        name: true,
        SponsorGame: {
          select: { gameId: true, prizeAmount: true },
          orderBy: { gameId: 'asc' },
        },
      },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');

    const ym = seasonYm();
    const leaders = await Promise.all(
      sponsor.SponsorGame.map(async (g) => {
        const leaderboard = await this.sponsorGameLeaderboard({
          sponsorCode,
          gameId: g.gameId,
          limit: 1,
        });
        const leader = leaderboard.rows.find((r) => r.rank === 1) ?? null;
        return {
          seasonYm: ym,
          gameId: g.gameId,
          prizeAmount: g.prizeAmount ?? 0,
          leader,
        };
      }),
    );

    return leaders;
  }

  async snapshotSponsorMonthlyLeaders(sponsorCode: string, reason = 'manual') {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, name: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');

    const ym = seasonYm();
    const leaders = await this.currentMonthlyLeadersForSponsor(sponsorCode);
    const rows = leaders
      .filter((item) => item.leader)
      .map((item) => ({
        scope: $Enums.BadgeScope.SPONSOR,
        seasonYm: ym,
        sponsorCode: sponsor.code,
        sponsorName: sponsor.name,
        gameId: item.gameId,
        leaderUserId: item.leader!.userId,
        leaderName: item.leader!.displayName,
        leaderEmail: item.leader!.email,
        pearls: item.leader!.pearls ?? 0,
        wins: item.leader!.wins ?? 0,
        losses: item.leader!.losses ?? 0,
        playedCount: item.leader!.playedCount ?? 0,
        reason,
      }));

    if (rows.length > 0) {
      await this.prisma.monthlyLeaderboardSnapshot.createMany({ data: rows });
    }

    return { seasonYm: ym, count: rows.length, leaders };
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
    const currentYm = seasonYm();
    const currentRange = seasonRange(currentYm);

    // Ensure sponsor & game exist (optional strictness)
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { code: sponsorCode },
      select: { code: true, name: true },
    });
    if (!sponsor) throw new NotFoundException('SPONSOR_NOT_FOUND');

    // Base: wallets = who is active in this sponsor game
    const walletTake = Math.max(limit, 500);
    const wallets = await this.prisma.sponsorGameWallet.findMany({
      where: { sponsorCode, gameId, user: { hideFromLeaderboard: false } },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
      take: walletTake,
    });

    const userIds = wallets.map((w) => w.userId);
    const FALLBACK_PEARLS = 5;

    // Aggregate wins/losses from matches for those users
    // We count outcomes where Match.sponsorCode=sponsorCode and Match.gameId=gameId
    const parts = await this.prisma.matchParticipant.findMany({
      where: {
        userId: { in: userIds },
        match: {
          sponsorCode,
          gameId,
          createdAt: { gte: currentRange.gte, lt: currentRange.lt },
        },
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
      {
        wins: number;
        losses: number;
        playedCount: number;
        recent: Array<'WIN' | 'LOSS'>;
        lastOutcome: 'WIN' | 'LOSS' | null;
        lastPlayedAt: Date | null;
      }
    >();

    for (const uid of userIds) {
      stats.set(uid, {
        wins: 0,
        losses: 0,
        playedCount: 0,
        recent: [],
        lastOutcome: null,
        lastPlayedAt: null,
      });
    }

    for (const p of parts) {
      const s = stats.get(p.userId);
      if (!s) continue;
      s.playedCount += 1;
      if (p.outcome === 'WIN') s.wins += 1;
      else s.losses += 1;
      const playedAt = p.match.createdAt;
      if (!s.lastPlayedAt || playedAt.getTime() > s.lastPlayedAt.getTime()) {
        s.lastPlayedAt = playedAt;
        s.lastOutcome = p.outcome;
      }

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

    const rows = wallets.map((w) => {
      const s = stats.get(w.userId) ?? {
        wins: 0,
        losses: 0,
        playedCount: 0,
        recent: [],
        lastOutcome: null,
        lastPlayedAt: null,
      };
      const streak = computeStreak(s.recent);
      const pearls =
        w.seasonYm === currentYm
          ? (w.pearls ?? FALLBACK_PEARLS)
          : FALLBACK_PEARLS;
      return {
        userId: w.userId,
        displayName: w.user?.displayName ?? '',
        email: w.user?.email ?? '',
        pearls,
        played: s.playedCount > 0,
        wins: s.wins,
        losses: s.losses,
        playedCount: s.playedCount,
        matches: s.playedCount,
        streak,
        fire: streak >= 3, // 🔥 show fire if streak >= 3
        lastOutcome: s.lastOutcome,
        lastPlayedAt: s.lastPlayedAt,
      };
    });

    rows.sort((a, b) => {
      if (a.played !== b.played) return a.played ? -1 : 1;
      if (a.played && b.played) {
        const pearls = b.pearls - a.pearls;
        if (pearls !== 0) return pearls;
        const last =
          (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0);
        if (last !== 0) return last;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    let playedRank = 0;

    return {
      sponsor,
      gameId,
      rows: rows.slice(0, limit).map((r) => {
        const rank = r.played ? ++playedRank : null;
        return {
          rank,
          rankLabel: rank == null ? '--' : String(rank),
          userId: r.userId,
          displayName: r.displayName,
          email: r.email,
          pearls: r.pearls,
          played: r.played,
          wins: r.wins,
          losses: r.losses,
          playedCount: r.playedCount,
          matches: r.matches,
          streak: r.streak,
          fire: r.fire,
          lastOutcome: r.lastOutcome,
          lastPlayedAt: r.lastPlayedAt?.toISOString() ?? null,
        };
      }),
    };
  }
}
