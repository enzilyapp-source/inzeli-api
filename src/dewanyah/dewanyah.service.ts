import { Injectable } from '@nestjs/common';
import { getDewanyahPearls } from '../common/pearls';
import { PrismaService } from '../prisma.service';
import { seasonRange, seasonYm } from '../common/badges';

@Injectable()
export class DewanyahService {
  constructor(private prisma: PrismaService) {}

  private async ensureApprovedMemberWallets(
    dewanyahId: string,
    gameId: string,
    userIds?: string[],
  ) {
    const targetUserIds =
      userIds && userIds.length > 0
        ? Array.from(new Set(userIds.filter((x) => x.trim().length > 0)))
        : (
            await this.prisma.dewanyahMember.findMany({
              where: { dewanyahId, status: 'approved' },
              select: { userId: true },
            })
          ).map((m) => m.userId);

    if (targetUserIds.length === 0 || !gameId.trim()) return;

    await Promise.all(
      targetUserIds.map((userId) =>
        getDewanyahPearls(this.prisma, userId, dewanyahId, gameId),
      ),
    );
  }

  private normalizePrizeAmount(value: number | undefined) {
    if (value == null || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.trunc(value));
  }

  private get oneSignalAppId() {
    return (process.env.ONESIGNAL_APP_ID ?? '').trim();
  }

  private get oneSignalApiKey() {
    return (process.env.ONESIGNAL_REST_API_KEY ?? '').trim();
  }

  private async notifyDewanyahOwnerJoinRequest(params: {
    ownerUserId: string;
    dewanyahId: string;
    dewanyahName: string;
    requesterName: string;
  }) {
    const appId = this.oneSignalAppId;
    const apiKey = this.oneSignalApiKey;
    if (!appId || !apiKey) return;

    const { ownerUserId, dewanyahId, dewanyahName, requesterName } = params;

    const payload = {
      app_id: appId,
      include_external_user_ids: [ownerUserId],
      channel_for_external_user_ids: 'push',
      headings: {
        en: 'New Dewanyah Join Request',
        ar: 'طلب انضمام جديد للديوانية',
      },
      contents: {
        en: `${requesterName} requested to join ${dewanyahName}`,
        ar: `${requesterName} طلب الانضمام إلى ${dewanyahName}`,
      },
      data: {
        type: 'dewanyah_join_request',
        dewanyahId,
      },
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    try {
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const raw = await res.text();
        // keep request flow resilient; notification failure must not block gameplay.
        console.warn(
          `OneSignal notify failed (${res.status}): ${raw.slice(0, 300)}`,
        );
      }
    } catch (e: any) {
      console.warn(`OneSignal notify error: ${e?.message || e}`);
    }
  }

  async createRequest(params: {
    userId: string;
    name: string;
    contact: string;
    gameId?: string;
    note?: string;
    prizeAmount?: number;
    anchorLat?: number;
    anchorLng?: number;
    requireApproval?: boolean;
    locationLock?: boolean;
    radiusMeters?: number;
  }) {
    const {
      userId,
      name,
      contact,
      gameId,
      note,
      prizeAmount,
      anchorLat,
      anchorLng,
      requireApproval,
      locationLock,
      radiusMeters,
    } = params;
    const normalizedPrizeAmount = this.normalizePrizeAmount(prizeAmount);
    return this.prisma.dewanyahRequest.create({
      data: {
        userId,
        name,
        contact,
        gameId,
        note,
        prizeAmount: normalizedPrizeAmount,
        anchorLat,
        anchorLng,
        requireApproval: requireApproval ?? true,
        locationLock: locationLock ?? false,
        radiusMeters,
      },
    });
  }

  async listRequests() {
    const reqs = await this.prisma.dewanyahRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    // enrich with user info for the admin UI
    return reqs.map((r) => ({
      ...r,
      ownerUserId: r.userId,
      ownerEmail: r.user?.email,
      owner: r.user?.displayName,
    }));
  }

  async listDewanyahs() {
    return this.prisma.dewanyah.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: {
        games: { select: { gameId: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async listAllAdmin() {
    return this.prisma.dewanyah.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        games: { select: { gameId: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async approveRequest(requestId: string, adminUserId?: string) {
    const req = await this.prisma.dewanyahRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw new Error('Request not found');
    if (req.status === 'approved') return req;

    const dew = await this.prisma.dewanyah.create({
      data: {
        name: req.name,
        ownerUserId: req.userId,
        ownerEmail: undefined,
        ownerName: undefined,
        prizeAmount: req.prizeAmount ?? 50,
        anchorLat: req.anchorLat ?? undefined,
        anchorLng: req.anchorLng ?? undefined,
        note: req.note,
        locationLock: req.locationLock,
        radiusMeters: req.radiusMeters,
        requireApproval: req.requireApproval,
        members: {
          create: [
            {
              userId: req.userId,
              status: 'approved',
              approvedAt: new Date(),
            },
          ],
        },
        games: req.gameId
          ? {
              create: [
                {
                  gameId: req.gameId,
                },
              ],
            }
          : undefined,
      },
    });

    await this.prisma.dewanyahRequest.update({
      where: { id: requestId },
      data: { status: 'approved', reviewedAt: new Date() },
    });

    if (req.gameId?.trim()) {
      await this.ensureApprovedMemberWallets(dew.id, req.gameId, [req.userId]);
    }

    return dew;
  }

  async deleteRequest(requestId: string) {
    const req = await this.prisma.dewanyahRequest.findUnique({
      where: { id: requestId },
      select: { id: true },
    });
    if (!req) throw new Error('Request not found');

    await this.prisma.dewanyahRequest.delete({
      where: { id: requestId },
    });

    return { id: requestId };
  }

  async updateDewanyah(
    id: string,
    data: {
      name?: string;
      ownerName?: string;
      ownerEmail?: string;
      note?: string;
      prizeAmount?: number;
      imageUrl?: string;
      themePrimary?: string;
      themeAccent?: string;
    },
  ) {
    const updates: any = { ...data };
    if (data.prizeAmount !== undefined) {
      updates.prizeAmount = this.normalizePrizeAmount(data.prizeAmount) ?? 0;
    }
    return this.prisma.dewanyah.update({
      where: { id },
      data: updates,
    });
  }

  async deleteDewanyah(id: string) {
    return this.prisma.dewanyah.delete({ where: { id } });
  }

  async getOwnerDewanyah(dewanyahId: string, ownerUserId: string) {
    const dew = await this.prisma.dewanyah.findUnique({
      where: { id: dewanyahId },
    });
    if (!dew) throw new Error('Dewanyah not found');
    if (dew.ownerUserId && dew.ownerUserId !== ownerUserId) {
      throw new Error('NOT_OWNER');
    }
    return dew;
  }

  async addGameToDewanyah(dewanyahId: string, gameId: string) {
    const game = await this.prisma.dewanyahGame.upsert({
      where: {
        dewanyahId_gameId: {
          dewanyahId,
          gameId,
        },
      },
      update: {},
      create: { dewanyahId, gameId },
    });
    await this.ensureApprovedMemberWallets(dewanyahId, gameId);
    return game;
  }

  async requestJoin(dewanyahId: string, userId: string) {
    const dew = await this.prisma.dewanyah.findUnique({
      where: { id: dewanyahId },
    });
    if (!dew) throw new Error('Dewanyah not found');
    const status = dew.requireApproval ? 'pending' : 'approved';
    const existing = await this.prisma.dewanyahMember.findUnique({
      where: {
        dewanyahId_userId: { dewanyahId, userId },
      },
      select: { status: true },
    });

    const member = await this.prisma.dewanyahMember.upsert({
      where: {
        dewanyahId_userId: { dewanyahId, userId },
      },
      update: { status, approvedAt: status === 'approved' ? new Date() : null },
      create: {
        dewanyahId,
        userId,
        status,
        approvedAt: status === 'approved' ? new Date() : null,
      },
    });

    if (status === 'approved') {
      const dewGames = await this.prisma.dewanyahGame.findMany({
        where: { dewanyahId },
        select: { gameId: true },
      });
      await Promise.all(
        dewGames.map((g) =>
          this.ensureApprovedMemberWallets(dewanyahId, g.gameId, [userId]),
        ),
      );
    }

    const becamePending =
      status === 'pending' && existing?.status !== 'pending';
    if (becamePending && dew.ownerUserId && dew.ownerUserId !== userId) {
      const requester = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, email: true },
      });
      const requesterName =
        requester?.displayName?.trim() || requester?.email?.trim() || 'لاعب';
      void this.notifyDewanyahOwnerJoinRequest({
        ownerUserId: dew.ownerUserId,
        dewanyahId,
        dewanyahName: dew.name ?? 'ديوانية',
        requesterName,
      });
    }

    return member;
  }

  async listPendingJoinRequestsForOwner(ownerUserId: string) {
    const rows = await this.prisma.dewanyahMember.findMany({
      where: {
        status: 'pending',
        dewanyah: { ownerUserId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        dewanyah: { select: { id: true, name: true } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });

    const grouped = new Map<
      string,
      {
        dewanyahId: string;
        dewanyahName: string;
        pendingCount: number;
        lastRequestAt: Date;
      }
    >();

    for (const row of rows) {
      const dewanyahId = row.dewanyahId;
      const existing = grouped.get(dewanyahId);
      if (!existing) {
        grouped.set(dewanyahId, {
          dewanyahId,
          dewanyahName: row.dewanyah?.name ?? 'ديوانية',
          pendingCount: 1,
          lastRequestAt: row.createdAt,
        });
        continue;
      }
      existing.pendingCount += 1;
      if (row.createdAt.getTime() > existing.lastRequestAt.getTime()) {
        existing.lastRequestAt = row.createdAt;
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.lastRequestAt.getTime() - a.lastRequestAt.getTime())
      .map((x) => ({
        dewanyahId: x.dewanyahId,
        dewanyahName: x.dewanyahName,
        pendingCount: x.pendingCount,
        lastRequestAt: x.lastRequestAt,
      }));
  }

  async setMemberStatus(dewanyahId: string, userId: string, status: string) {
    const member = await this.prisma.dewanyahMember.update({
      where: {
        dewanyahId_userId: { dewanyahId, userId },
      },
      data: {
        status,
        approvedAt: status === 'approved' ? new Date() : null,
      },
    });
    if (status === 'approved') {
      const dewGames = await this.prisma.dewanyahGame.findMany({
        where: { dewanyahId },
        select: { gameId: true },
      });
      await Promise.all(
        dewGames.map((g) =>
          this.ensureApprovedMemberWallets(dewanyahId, g.gameId, [userId]),
        ),
      );
    }
    return member;
  }

  async removeMember(
    dewanyahId: string,
    ownerUserId: string,
    memberUserId: string,
  ) {
    const dew = await this.getOwnerDewanyah(dewanyahId, ownerUserId);
    if (!memberUserId) throw new Error('userId required');
    if (memberUserId === ownerUserId || memberUserId === dew.ownerUserId) {
      throw new Error('OWNER_CANNOT_REMOVE_SELF');
    }

    const deleted = await this.prisma.dewanyahMember.deleteMany({
      where: { dewanyahId, userId: memberUserId },
    });

    return { dewanyahId, userId: memberUserId, deleted: deleted.count };
  }

  async leaveDewanyah(dewanyahId: string, userId: string) {
    const dew = await this.prisma.dewanyah.findUnique({
      where: { id: dewanyahId },
      select: { ownerUserId: true },
    });
    if (!dew) throw new Error('Dewanyah not found');
    if (dew.ownerUserId === userId) throw new Error('OWNER_CANNOT_LEAVE');

    const deleted = await this.prisma.dewanyahMember.deleteMany({
      where: { dewanyahId, userId },
    });

    return { dewanyahId, userId, deleted: deleted.count };
  }

  async listMembersForOwner(dewanyahId: string, ownerUserId: string) {
    await this.getOwnerDewanyah(dewanyahId, ownerUserId);
    return this.prisma.dewanyahMember.findMany({
      where: { dewanyahId },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async leaderboard(dewanyahId: string, limit = 100, gameId?: string) {
    const n = Math.max(1, Math.min(100, limit));
    const dew = await this.prisma.dewanyah.findUnique({
      where: { id: dewanyahId },
      select: {
        games: {
          select: { gameId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!dew) throw new Error('Dewanyah not found');

    const gameIds = dew.games.map((g) => g.gameId).filter((g) => g.length > 0);
    const requestedGameId = (gameId ?? '').trim();
    if (requestedGameId && !gameIds.includes(requestedGameId)) {
      throw new Error('GAME_NOT_IN_DEWANYAH');
    }
    const selectedGameId = requestedGameId || null;
    const currentRange = seasonRange(seasonYm());

    const members = await this.prisma.dewanyahMember.findMany({
      where: {
        dewanyahId,
        status: 'approved',
        user: { hideFromLeaderboard: false },
      },
      include: {
        user: {
          select: { id: true, displayName: true, email: true, pearls: true },
        },
      },
    });

    const userIds = members.map((m) => m.userId);
    const FALLBACK_PEARLS = 5;
    const currentYm = seasonYm();
    const walletMap = new Map<string, { pearls: number; seasonYm: number }>();
    if (selectedGameId && userIds.length > 0) {
      await this.ensureApprovedMemberWallets(
        dewanyahId,
        selectedGameId,
        userIds,
      );
      const wallets = await this.prisma.dewanyahGameWallet.findMany({
        where: { dewanyahId, gameId: selectedGameId, userId: { in: userIds } },
        select: { userId: true, pearls: true, seasonYm: true },
      });
      for (const w of wallets) {
        walletMap.set(w.userId, {
          pearls: w.pearls ?? FALLBACK_PEARLS,
          seasonYm: w.seasonYm ?? 0,
        });
      }
    }

    const playedStats = new Map<
      string,
      {
        wins: number;
        losses: number;
        playedCount: number;
        lastOutcome: 'WIN' | 'LOSS' | null;
        lastPlayedAt: Date | null;
      }
    >();
    if (userIds.length > 0) {
      const parts = await this.prisma.matchParticipant.findMany({
        where: {
          userId: { in: userIds },
          match: {
            ...(selectedGameId ? { gameId: selectedGameId } : {}),
            createdAt: { gte: currentRange.gte, lt: currentRange.lt },
            room: { is: { dewanyahId } },
          },
        },
        select: {
          userId: true,
          outcome: true,
          match: { select: { createdAt: true } },
        },
        orderBy: { match: { createdAt: 'desc' } },
        take: 5000,
      });

      for (const p of parts) {
        const outcome = String(p.outcome).toUpperCase();
        const playedAt = p.match.createdAt;
        const current = playedStats.get(p.userId) ?? {
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
          !current.lastPlayedAt ||
          playedAt.getTime() > current.lastPlayedAt.getTime()
        ) {
          current.lastPlayedAt = playedAt;
          current.lastOutcome =
            outcome === 'WIN' || outcome === 'LOSS' ? outcome : null;
        }
        playedStats.set(p.userId, current);
      }
    }

    const rows = members.map((m) => {
      const wallet = selectedGameId ? walletMap.get(m.userId) : null;
      const pearls =
        selectedGameId && wallet?.seasonYm === currentYm
          ? wallet.pearls
          : selectedGameId
            ? FALLBACK_PEARLS
            : 0;
      const stats = playedStats.get(m.userId) ?? {
        wins: 0,
        losses: 0,
        playedCount: 0,
        lastOutcome: null,
        lastPlayedAt: null,
      };
      const played = stats.playedCount > 0;
      return {
        userId: m.userId,
        displayName: m.user?.displayName ?? 'لاعب',
        email: m.user?.email,
        pearls,
        status: m.status,
        joinedAt: m.createdAt,
        played,
        wins: stats.wins,
        losses: stats.losses,
        playedCount: stats.playedCount,
        matches: stats.playedCount,
        lastOutcome: stats.lastOutcome,
        lastPlayedAt: stats.lastPlayedAt,
      };
    });

    rows.sort((a, b) => {
      if (a.played !== b.played) return a.played ? -1 : 1;
      if (a.played && b.played) {
        const p = (b.pearls ?? 0) - (a.pearls ?? 0);
        if (p != 0) return p;
        const last =
          (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0);
        if (last != 0) return last;
      }
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

    let playedRank = 0;
    return rows.slice(0, n).map((r) => {
      const rank = r.played ? ++playedRank : null;
      return {
        ...r,
        rank,
        rankLabel: rank == null ? '--' : String(rank),
        lastPlayedAt: r.lastPlayedAt?.toISOString() ?? null,
      };
    });
  }

  // Admin: create dewanyah directly
  async createDewanyahManual(data: {
    name: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerUserId?: string;
    note?: string;
    prizeAmount?: number;
    gameId: string;
    requireApproval?: boolean;
    locationLock?: boolean;
    radiusMeters?: number;
    anchorLat?: number;
    anchorLng?: number;
    imageUrl?: string;
    themePrimary?: string;
    themeAccent?: string;
  }) {
    const {
      name,
      ownerName,
      ownerEmail,
      ownerUserId,
      note,
      prizeAmount,
      gameId,
      requireApproval,
      locationLock,
      radiusMeters,
      anchorLat,
      anchorLng,
      imageUrl,
      themePrimary,
      themeAccent,
    } = data;
    let ownerId = ownerUserId;
    if (!ownerId && ownerEmail) {
      const user = await this.prisma.user.findUnique({
        where: { email: ownerEmail },
      });
      if (user) ownerId = user.id;
    }
    const fallbackOwner = ownerId ?? 'admin';
    const payload: any = {
      name,
      ownerName,
      ownerEmail,
      ownerUserId: fallbackOwner,
      prizeAmount: this.normalizePrizeAmount(prizeAmount) ?? 50,
      anchorLat: anchorLat ?? undefined,
      anchorLng: anchorLng ?? undefined,
      note,
      requireApproval: requireApproval ?? true,
      locationLock: locationLock ?? false,
      radiusMeters,
      games: { create: [{ gameId }] },
      members:
        ownerUserId != null
          ? {
              create: [
                {
                  userId: ownerUserId,
                  status: 'approved',
                  approvedAt: new Date(),
                },
              ],
            }
          : undefined,
    };
    if (imageUrl != null) payload.imageUrl = imageUrl;
    if (themePrimary != null) payload.themePrimary = themePrimary;
    if (themeAccent != null) payload.themeAccent = themeAccent;

    const dew = await this.prisma.dewanyah.create({ data: payload });
    if (ownerUserId) {
      await this.ensureApprovedMemberWallets(dew.id, gameId, [ownerUserId]);
    }
    return dew;
  }
}
