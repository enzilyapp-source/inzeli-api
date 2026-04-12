import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DewanyahService {
  constructor(private prisma: PrismaService) {}

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

    return dew;
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
    return this.prisma.dewanyahGame.upsert({
      where: {
        dewanyahId_gameId: {
          dewanyahId,
          gameId,
        },
      },
      update: {},
      create: { dewanyahId, gameId },
    });
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

    const becamePending = status === 'pending' && existing?.status !== 'pending';
    if (becamePending && dew.ownerUserId && dew.ownerUserId !== userId) {
      const requester = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, email: true },
      });
      const requesterName =
        requester?.displayName?.trim() ||
        requester?.email?.trim() ||
        'لاعب';
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
    return this.prisma.dewanyahMember.update({
      where: {
        dewanyahId_userId: { dewanyahId, userId },
      },
      data: {
        status,
        approvedAt: status === 'approved' ? new Date() : null,
      },
    });
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
    const selectedGameId =
      gameId && gameIds.includes(gameId)
        ? gameId
        : (gameIds[0] ?? null);

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
    const walletMap = new Map<string, number>();
    if (selectedGameId && userIds.length > 0) {
      const wallets = await this.prisma.dewanyahGameWallet.findMany({
        where: { dewanyahId, gameId: selectedGameId, userId: { in: userIds } },
        select: { userId: true, pearls: true },
      });
      for (const w of wallets) walletMap.set(w.userId, w.pearls ?? 0);
    }

    const rows = members.map((m) => ({
      userId: m.userId,
      displayName: m.user?.displayName ?? 'لاعب',
      email: m.user?.email,
      pearls:
        walletMap.get(m.userId) ??
        (selectedGameId ? 5 : (m.user?.pearls ?? 5)),
      status: m.status,
      joinedAt: m.createdAt,
    }));

    rows.sort((a, b) => {
      const p = (b.pearls ?? 0) - (a.pearls ?? 0);
      if (p != 0) return p;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

    return rows.slice(0, n);
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

    return this.prisma.dewanyah.create({ data: payload });
  }
}
