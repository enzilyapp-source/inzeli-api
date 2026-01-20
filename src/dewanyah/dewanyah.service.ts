import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DewanyahService {
  constructor(private prisma: PrismaService) {}

  async createRequest(params: {
    userId: string;
    name: string;
    contact: string;
    gameId?: string;
    note?: string;
    requireApproval?: boolean;
    locationLock?: boolean;
    radiusMeters?: number;
  }) {
    const { userId, name, contact, gameId, note, requireApproval, locationLock, radiusMeters } = params;
    return this.prisma.dewanyahRequest.create({
      data: {
        userId,
        name,
        contact,
        gameId,
        note,
        requireApproval: requireApproval ?? true,
        locationLock: locationLock ?? false,
        radiusMeters,
      },
    });
  }

  async listRequests() {
    const reqs = await this.prisma.dewanyahRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    // enrich with user info for the admin UI
    return reqs.map((r) => ({
      ...r,
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
    const req = await this.prisma.dewanyahRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('Request not found');
    if (req.status === 'approved') return req;

    const dew = await this.prisma.dewanyah.create({
      data: {
        name: req.name,
        ownerUserId: req.userId,
        ownerEmail: undefined,
        ownerName: undefined,
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

  async updateDewanyah(id: string, data: { name?: string; ownerName?: string; ownerEmail?: string; note?: string; imageUrl?: string; themePrimary?: string; themeAccent?: string }) {
    return this.prisma.dewanyah.update({
      where: { id },
      data,
    });
  }

  async deleteDewanyah(id: string) {
    return this.prisma.dewanyah.delete({ where: { id } });
  }

  async getOwnerDewanyah(dewanyahId: string, ownerUserId: string) {
    const dew = await this.prisma.dewanyah.findUnique({ where: { id: dewanyahId } });
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
    const dew = await this.prisma.dewanyah.findUnique({ where: { id: dewanyahId } });
    if (!dew) throw new Error('Dewanyah not found');
    const status = dew.requireApproval ? 'pending' : 'approved';
    return this.prisma.dewanyahMember.upsert({
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
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async leaderboard(dewanyahId: string, limit = 100) {
    const n = Math.max(1, Math.min(100, limit));
    const members = await this.prisma.dewanyahMember.findMany({
      where: { dewanyahId, status: 'approved' },
      orderBy: { approvedAt: 'desc' },
      take: n,
      include: {
        user: {
          select: { id: true, displayName: true, email: true, pearls: true },
        },
      },
    });
    return members.map((m) => ({
      userId: m.userId,
      displayName: m.user?.displayName ?? 'لاعب',
      email: m.user?.email,
      pearls: m.user?.pearls ?? 0,
      status: m.status,
      joinedAt: m.createdAt,
    }));
  }

  // Admin: create dewanyah directly
  async createDewanyahManual(data: {
    name: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerUserId?: string;
    note?: string;
    gameId: string;
    requireApproval?: boolean;
    locationLock?: boolean;
    radiusMeters?: number;
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
      gameId,
      requireApproval,
      locationLock,
      radiusMeters,
      imageUrl,
      themePrimary,
      themeAccent,
    } = data;
    let ownerId = ownerUserId;
    if (!ownerId && ownerEmail) {
      const user = await this.prisma.user.findUnique({ where: { email: ownerEmail } });
      if (user) ownerId = user.id;
    }
    const fallbackOwner = ownerId ?? 'admin';
    const payload: any = {
      name,
      ownerName,
      ownerEmail,
      ownerUserId: fallbackOwner,
      note,
      requireApproval: requireApproval ?? true,
      locationLock: locationLock ?? false,
      radiusMeters,
      games: { create: [{ gameId }] },
      members: ownerUserId != null
          ? { create: [{ userId: ownerUserId, status: 'approved', approvedAt: new Date() }] }
          : undefined,
    };
    if (imageUrl != null) payload.imageUrl = imageUrl;
    if (themePrimary != null) payload.themePrimary = themePrimary;
    if (themeAccent != null) payload.themeAccent = themeAccent;

    return this.prisma.dewanyah.create({ data: payload as any });
  }
}
