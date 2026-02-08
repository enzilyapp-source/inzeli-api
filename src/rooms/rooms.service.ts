// src/rooms/rooms.service.ts
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma, $Enums } from '@prisma/client';
import {
  getGamePearls,
  incGamePearls,
  decGamePearls,
  takeGamePearlsOrZero,
  getSponsorPearls,
  incSponsorPearls,
  decSponsorPearls,
} from '../common/pearls';
import { MatchesService } from '../matches/matches.service';

const STAKE = 0; // لا نسحب لؤلؤ عند الإنشاء/الانضمام (يتم الخصم فقط عند الخسارة)
const DEFAULT_RADIUS_METERS = 100;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService, private matches: MatchesService) {}

  // ---------- helpers ----------
  private newCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  private endsAt(room: { startedAt: Date | null; timerSec: number | null }) {
    if (!room.startedAt || !room.timerSec) return null;
    return new Date(room.startedAt.getTime() + room.timerSec * 1000);
  }

  private isLocked(room: { startedAt: Date | null; timerSec: number | null }) {
    const end = this.endsAt(room);
    return !!end && new Date() < end;
  }

  private remaining(room: { startedAt: Date | null; timerSec: number | null }) {
    const end = this.endsAt(room);
    if (!end) return 0;
    return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 1000));
  }

  private buildTeamQuorum(room: {
    players: Array<{
      team: $Enums.TeamSide | null;
      user: { permanentScore: number | null } | null;
    }>;
  }) {
    const calc = (team: 'A' | 'B') => {
      const list = (room.players || []).filter((p) => p.team === team);
      const required = list.length;
      const available = list.reduce((sum, p) => sum + (p.user?.permanentScore ?? 0), 0);
      const quorumMet = required > 0 && available >= required;
      return { required, available, quorumMet };
    };
    return { A: calc('A'), B: calc('B') };
  }

  private async getRoomWithPlayers(code: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: {
        players: true,
      },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    return room;
  }

  // ---------- core ----------
  async createRoom(gameId: string, hostId: string, sponsorCode?: string, lat?: number, lng?: number, radiusMeters?: number) {
    // ensure game exists
    await this.prisma.game.upsert({
      where: { id: gameId },
      update: {},
      create: { id: gameId, name: gameId, category: 'عام' },
    });

    // unique code
    let code = this.newCode();
    while (await this.prisma.room.findUnique({ where: { code } })) code = this.newCode();

    const room = await this.prisma.$transaction(async (tx) => {
      // no pearl deduction on create; stakes stay 0
      const hostStake = 0;

      const r = await tx.room.create({
        data: {
          code,
          gameId,
          hostUserId: hostId,
          hostLat: lat ?? null,
          hostLng: lng ?? null,
          radiusMeters: radiusMeters ?? DEFAULT_RADIUS_METERS,
          status: 'waiting',
          allowZeroCredit: true,
          ...(sponsorCode ? { sponsorCode } : {}),
          players: { create: { userId: hostId } },
          stakes: { create: { userId: hostId, amount: hostStake } },
        } as any,
        include: {
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  pearls: true,
                  creditPoints: true,
                  permanentScore: true,
                  avatarBase64: true,
                  avatarPath: true,
                },
              },
            },
          },
          stakes: true,
        },
      });

      await tx.timelineEvent.create({
        data: {
          kind: 'ROOM_CREATED',
          roomCode: code,
          gameId,
          userId: hostId,
          meta: { stake: hostStake, sponsorCode: sponsorCode ?? null },
        },
      });

      return r;
    });

    const locked = this.isLocked(room);
    const remainingSec = this.remaining(room);
    const teamQuorum = this.buildTeamQuorum(room as any);

    return { ...room, locked, remainingSec, teamQuorum };
  }

  async getByCode(code: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: {
        players: {
          include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  pearls: true,
                  creditPoints: true,
                  permanentScore: true,
                },
              },
            },
          },
        stakes: true,
      },
    });

    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');

    const locked = this.isLocked(room);
    const remainingSec = this.remaining(room);
    const teamQuorum = this.buildTeamQuorum(room as any);

    return { ...room, locked, remainingSec, teamQuorum };
  }

  async join(code: string, userId: string, lat?: number, lng?: number) {
    const room = (await this.prisma.room.findUnique({ where: { code } })) as any;
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');

    // لا يسمح بالانضمام بعد بدء العداد/الروم
    if (room.status !== 'waiting') {
      throw new BadRequestException('ROOM_NOT_JOINABLE');
    }
    if (this.isLocked(room)) {
      throw new BadRequestException('ROOM_LOCKED');
    }

    // تحقق القرب (إن توفر موقع المضيف)
    if (room.hostLat != null && room.hostLng != null) {
      if (lat == null || lng == null) {
        throw new BadRequestException('NEED_LOCATION');
      }
      const dist = haversineMeters(room.hostLat, room.hostLng, lat, lng);
      const radius = room.radiusMeters ?? DEFAULT_RADIUS_METERS;
      if (dist > radius) {
        throw new BadRequestException('TOO_FAR');
      }
    }

    // read sponsorCode safely
    const sponsorCode: string | null = (room as any)?.sponsorCode ?? null;

    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.roomPlayer.findUnique({
        where: { roomCode_userId: { roomCode: code, userId } },
      });
      if (exists) return;

      // no pearl deduction on join
      const stake = 0;

      await tx.roomStake.create({
        data: { roomCode: code, userId, amount: stake },
      });

      await tx.roomPlayer.create({
        data: { roomCode: code, userId },
      });

      await tx.timelineEvent.create({
        data: {
          kind: 'ROOM_JOINED',
          roomCode: code,
          userId,
          meta: { charged: stake, sponsorCode },
        },
      });
    });

    return this.getByCode(code);
  }

  async start(
    code: string,
    hostId: string,
    params: { targetWinPoints?: number; allowZeroCredit?: boolean; timerSec?: number },
  ) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: {
        players: {
          include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  pearls: true,
                  creditPoints: true,
                  permanentScore: true,
                },
              },
            },
          },
        stakes: true,
      },
    });

    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (room.hostUserId !== hostId) throw new ForbiddenException('ONLY_HOST_CAN_START');
    if (room.status !== 'waiting') throw new BadRequestException('ALREADY_STARTED');
    if ((room.players?.length ?? 0) < 2) throw new BadRequestException('NEED_TWO_PLAYERS');

    const target = params.targetWinPoints ?? null;
    const sec = params.timerSec ?? 600;

    const updated = await this.prisma.room.update({
      where: { code },
      data: {
        status: 'running',
        targetWinPoints: target,
        allowZeroCredit: false,
        timerSec: sec,
        startedAt: new Date(),
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                permanentScore: true,
              },
            },
          },
        },
        stakes: true,
      },
    });

    await this.prisma.timelineEvent.create({
      data: {
        kind: 'ROOM_STARTED',
        roomCode: code,
        userId: hostId,
        meta: { targetWinPoints: target, timerSec: sec },
      },
    });

    const locked = this.isLocked(updated);
    const remainingSec = this.remaining(updated);
    const teamQuorum = this.buildTeamQuorum(updated as any);

    return { ...updated, locked, remainingSec, teamQuorum };
  }

  // Optional: allow changing stake before start (keeps your existing endpoint shape)
  async setStake(code: string, userId: string, amount: number) {
    if (amount < 0) throw new BadRequestException('INVALID_STAKE');

    const room = await this.prisma.room.findUnique({ where: { code } });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (room.status !== 'waiting') throw new BadRequestException('STAKE_ONLY_BEFORE_START');

    const sponsorCode: string | null = (room as any)?.sponsorCode ?? null;

    await this.prisma.$transaction(async (tx) => {
      // refund old stake
      const old = await tx.roomStake.findUnique({
        where: { roomCode_userId: { roomCode: code, userId } },
      });

      if (old) {
        if (sponsorCode) await incSponsorPearls(tx, userId, sponsorCode, room.gameId, old.amount);
        else await incGamePearls(tx, userId, room.gameId, old.amount);

        await tx.roomStake.delete({
          where: { roomCode_userId: { roomCode: code, userId } },
        });
      }

      // take new stake
      if (sponsorCode) {
        const p = await getSponsorPearls(tx, userId, sponsorCode, room.gameId);
        if (p < amount) throw new BadRequestException('NOT_ENOUGH_PEARLS_SPONSOR');
        await decSponsorPearls(tx, userId, sponsorCode, room.gameId, amount);
      } else {
        const p = await getGamePearls(tx, userId, room.gameId);
        if (p < amount) throw new BadRequestException('NOT_ENOUGH_PEARLS');
        if (amount > 0) await decGamePearls(tx, userId, room.gameId, amount);
      }

      await tx.roomStake.create({
        data: { roomCode: code, userId, amount },
      });

      await tx.timelineEvent.create({
        data: {
          kind: 'STAKE_SET',
          roomCode: code,
          userId,
          meta: { amount, sponsorCode },
        },
      });
    });

    return this.getByCode(code);
  }

  // ---------- teams / leaders ----------
  async setPlayerTeam(code: string, actorUserId: string, playerUserId: string, team: $Enums.TeamSide) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: { hostUserId: true, status: true },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (room.hostUserId !== actorUserId) throw new ForbiddenException('ONLY_HOST_CAN_SET_TEAM');
    if (room.status !== 'waiting') throw new BadRequestException('TEAM_ONLY_BEFORE_START');

    // ensure player exists in room
    const exists = await this.prisma.roomPlayer.findUnique({
      where: { roomCode_userId: { roomCode: code, userId: playerUserId } },
    });
    if (!exists) throw new NotFoundException('PLAYER_NOT_IN_ROOM');

    await this.prisma.roomPlayer.update({
      where: { roomCode_userId: { roomCode: code, userId: playerUserId } },
      data: { team },
    });

    await this.prisma.timelineEvent.create({
      data: {
        kind: 'TEAM_SET',
        roomCode: code,
        userId: actorUserId,
        meta: { playerUserId, team },
      },
    });

    return this.getByCode(code);
  }

  async setTeamLeader(code: string, actorUserId: string, team: $Enums.TeamSide, leaderUserId: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: { hostUserId: true, status: true },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (room.hostUserId !== actorUserId) throw new ForbiddenException('ONLY_HOST_CAN_SET_LEADER');
    if (room.status !== 'waiting') throw new BadRequestException('LEADER_ONLY_BEFORE_START');

    // ensure leader is in the room on same team
    const player = await this.prisma.roomPlayer.findUnique({
      where: { roomCode_userId: { roomCode: code, userId: leaderUserId } },
      select: { team: true },
    });
    if (!player) throw new NotFoundException('PLAYER_NOT_IN_ROOM');
    if (player.team && player.team !== team) {
      // align player team with chosen team
      await this.prisma.roomPlayer.update({
        where: { roomCode_userId: { roomCode: code, userId: leaderUserId } },
        data: { team },
      });
    }

    // unset other leaders for that team, then set chosen leader
    await this.prisma.$transaction([
      this.prisma.roomPlayer.updateMany({
        where: { roomCode: code, team },
        data: { isLeader: false },
      }),
      this.prisma.roomPlayer.update({
        where: { roomCode_userId: { roomCode: code, userId: leaderUserId } },
        data: { isLeader: true },
      }),
    ]);

    await this.prisma.timelineEvent.create({
      data: {
        kind: 'TEAM_LEADER_SET',
        roomCode: code,
        userId: actorUserId,
        meta: { team, leaderUserId },
      },
    });

    return this.getByCode(code);
  }

  // ---------- result + approvals (REST polling) ----------
  async submitResult(
    code: string,
    hostId: string,
    payload: { winners: string[]; losers: string[] },
  ) {
    const room = await this.getRoomWithPlayers(code);
    if (room.hostUserId !== hostId) throw new ForbiddenException('ONLY_HOST_CAN_SUBMIT');
    const winners = (payload.winners ?? []).filter(Boolean);
    const losers = (payload.losers ?? []).filter(Boolean);
    if (!winners.length) throw new BadRequestException('WINNERS_REQUIRED');

    await this.prisma.$transaction(async (tx) => {
      await tx.roomResultVote.deleteMany({ where: { roomCode: code } });
      await tx.room.update({
        where: { code },
        data: {
          resultStatus: 'pending',
          resultPayload: { winners, losers },
          resultSubmittedBy: hostId,
          resultUpdatedAt: new Date(),
        },
      });
      // host approves by default
      await tx.roomResultVote.create({
        data: { roomCode: code, userId: hostId, approve: true },
      });
    });

    return this.getResultState(code);
  }

  async voteResult(code: string, userId: string, approve: boolean) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: { players: true, resultVotes: true },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    const inRoom = room.players.some((p) => p.userId === userId);
    if (!inRoom) throw new ForbiddenException('NOT_IN_ROOM');
    if (room.resultStatus !== $Enums.RoomResultStatus.pending) {
      throw new BadRequestException('RESULT_NOT_PENDING');
    }

    if (!approve) {
      // رفض: نرجع للحالة rejected وعلى الهوست تحديد نتيجة جديدة
      await this.prisma.$transaction(async (tx) => {
        await tx.roomResultVote.deleteMany({ where: { roomCode: code } });
        await tx.room.update({
          where: { code },
          data: { resultStatus: 'rejected', resultUpdatedAt: new Date() },
        });
      });
      return this.getResultState(code);
    }

    await this.prisma.roomResultVote.upsert({
      where: { roomCode_userId: { roomCode: code, userId } },
      update: { approve: true, createdAt: new Date() },
      create: { roomCode: code, userId, approve: true },
    });

    // إذا وافق الجميع، ننجز النتيجة ونغلق الروم
    const totalPlayers = room.players.length;
    const approvals = await this.prisma.roomResultVote.count({
      where: { roomCode: code, approve: true },
    });
    if (approvals >= totalPlayers) {
      return this.finalizeResult(room);
    }

    return this.getResultState(code);
  }

  async getResultState(code: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: {
        resultVotes: true,
        players: true,
      },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    return {
      code,
      status: room.resultStatus,
      payload: room.resultPayload,
      submittedBy: room.resultSubmittedBy,
      updatedAt: room.resultUpdatedAt,
      votes: room.resultVotes.map((v) => ({ userId: v.userId, approve: v.approve })),
      totalPlayers: room.players.length,
    };
  }

  private async finalizeResult(room: any) {
    if (room.resultStatus === $Enums.RoomResultStatus.approved) return this.getResultState(room.code);

    const payload = (room.resultPayload as any) || {};
    const winners: string[] = Array.isArray(payload.winners) ? payload.winners : [];
    const losers: string[] = Array.isArray(payload.losers) ? payload.losers : [];

    // أنشئ المباراة لتسوية اللآلئ والنتيجة
    await this.matches.createMatch({
      roomCode: room.code,
      gameId: room.gameId,
      winners,
      losers,
    });

    await this.prisma.room.update({
      where: { code: room.code },
      data: {
        status: 'finished',
        resultStatus: 'approved',
        resultUpdatedAt: new Date(),
        timerSec: null,
      },
    });

    return this.getResultState(room.code);
  }
}
