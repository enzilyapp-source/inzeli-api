// src/rooms/rooms.service.ts
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
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
  getDewanyahPearls,
  incDewanyahPearls,
  decDewanyahPearls,
} from '../common/pearls';
import { MatchesService } from '../matches/matches.service';

const STAKE = 0; // لا نسحب لؤلؤ عند الإنشاء/الانضمام (يتم الخصم فقط عند الخسارة)
const DEFAULT_RADIUS_METERS = 100;
const DAFAN_MAX_PLAYERS = 6;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private reminderTicker?: NodeJS.Timeout;
  private readonly lastReminderAt = new Map<string, number>();
  private static readonly REMINDER_SCAN_MS = 60 * 1000;
  private static readonly REMINDER_INTERVAL_MS = 3 * 60 * 1000;
  private static readonly REMINDER_LINES = [
    'للحينكم تلعبون؟',
    'شلون اللعب؟',
    'شالأخبار؟',
    'وين واصلين؟',
    'النتيجة للحين ما انحسمت 👀',
  ];

  constructor(
    private prisma: PrismaService,
    private matches: MatchesService,
  ) {}

  onModuleInit() {
    // Background reminder loop (best-effort): nudges players/host to finish stale rooms.
    this.reminderTicker = setInterval(() => {
      void this.sweepResultReminders();
    }, RoomsService.REMINDER_SCAN_MS);
    this.reminderTicker.unref?.();
  }

  onModuleDestroy() {
    if (this.reminderTicker) clearInterval(this.reminderTicker);
    this.reminderTicker = undefined;
  }

  private get oneSignalAppId() {
    return (process.env.ONESIGNAL_APP_ID ?? '').trim();
  }

  private get oneSignalApiKey() {
    return (process.env.ONESIGNAL_REST_API_KEY ?? '').trim();
  }

  private randomReminderLine() {
    const list = RoomsService.REMINDER_LINES;
    return list[Math.floor(Math.random() * list.length)] ?? 'تم تذكيركم بحسم النتيجة';
  }

  private async sendPushReminder(params: {
    recipients: string[];
    headingAr: string;
    contentAr: string;
    data: Record<string, any>;
  }) {
    const appId = this.oneSignalAppId;
    const apiKey = this.oneSignalApiKey;
    if (!appId || !apiKey) return false;

    const recipients = params.recipients
      .map((x) => (x ?? '').trim())
      .filter((x) => x.length > 0);
    if (!recipients.length) return false;

    const payload = {
      app_id: appId,
      include_external_user_ids: recipients,
      channel_for_external_user_ids: 'push',
      headings: { ar: params.headingAr, en: 'Match reminder' },
      contents: { ar: params.contentAr, en: 'Please complete the match result.' },
      data: params.data,
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
        console.warn(
          `OneSignal room reminder failed (${res.status}): ${raw.slice(0, 300)}`,
        );
        return false;
      }
      return true;
    } catch (e: any) {
      console.warn(`OneSignal room reminder error: ${e?.message || e}`);
      return false;
    }
  }

  private async sweepResultReminders() {
    const appId = this.oneSignalAppId;
    const apiKey = this.oneSignalApiKey;
    if (!appId || !apiKey) return;

    const now = Date.now();
    const running = await this.prisma.room.findMany({
      where: {
        status: 'running',
        startedAt: { not: null },
        timerSec: { not: null },
      },
      select: {
        code: true,
        gameId: true,
        hostUserId: true,
        startedAt: true,
        timerSec: true,
        resultStatus: true,
        players: { select: { userId: true } },
        resultVotes: { select: { userId: true, approve: true } },
      },
      take: 200,
    });

    const activeCodes = new Set(running.map((r) => r.code));
    for (const code of Array.from(this.lastReminderAt.keys())) {
      if (!activeCodes.has(code)) this.lastReminderAt.delete(code);
    }

    for (const room of running) {
      const startMs = room.startedAt?.getTime() ?? 0;
      const sec = room.timerSec ?? 0;
      if (!startMs || sec <= 0) continue;
      const endMs = startMs + sec * 1000;
      if (now < endMs) continue;

      if (room.resultStatus === $Enums.RoomResultStatus.approved) continue;

      const lastAt = this.lastReminderAt.get(room.code) ?? 0;
      if (now - lastAt < RoomsService.REMINDER_INTERVAL_MS) continue;

      let recipients: string[] = [];
      let headingAr = 'تذكير بحسم النتيجة';
      let contentAr = `${this.randomReminderLine()} انتهى الوقت، حدّدوا النتيجة الآن.`;

      if (room.resultStatus === $Enums.RoomResultStatus.pending) {
        const approvedIds = new Set(
          room.resultVotes.filter((v) => v.approve).map((v) => v.userId),
        );
        recipients = room.players
          .map((p) => p.userId)
          .filter((uid) => !approvedIds.has(uid));
        headingAr = 'بانتظار موافقتكم على النتيجة';
        contentAr = `${this.randomReminderLine()} يرجى فتح الروم واعتماد النتيجة.`;
      } else {
        // waiting/rejected: host needs to submit/re-submit result.
        recipients = [room.hostUserId];
        headingAr = 'المضيف: حسم النتيجة مطلوب';
        contentAr = `${this.randomReminderLine()} انتهى العداد في ${room.gameId}.`;
      }

      const sent = await this.sendPushReminder({
        recipients,
        headingAr,
        contentAr,
        data: {
          type: 'room_result_reminder',
          roomCode: room.code,
          gameId: room.gameId,
          resultStatus: room.resultStatus,
        },
      });
      if (!sent) continue;

      this.lastReminderAt.set(room.code, now);
      await this.prisma.timelineEvent.create({
        data: {
          kind: 'ROOM_RESULT_REMINDER',
          roomCode: room.code,
          gameId: room.gameId,
          userId: recipients[0] ?? null,
          meta: {
            recipientsCount: recipients.length,
            resultStatus: room.resultStatus,
          },
        },
      });
    }
  }

  // ---------- helpers ----------
  private newCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++)
      s += chars[Math.floor(Math.random() * chars.length)];
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
      const available = list.reduce(
        (sum, p) => sum + (p.user?.permanentScore ?? 0),
        0,
      );
      const quorumMet = required > 0 && available >= required;
      return { required, available, quorumMet };
    };
    return { A: calc('A'), B: calc('B') };
  }

  private isDafanGame(gameId?: string | null) {
    const g = (gameId ?? '').toString().trim().toLowerCase();
    return g == 'دفان' || g == 'dafan';
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
  async createRoom(
    gameId: string,
    hostId: string,
    sponsorCode?: string,
    dewanyahId?: string,
    lat?: number,
    lng?: number,
    radiusMeters?: number,
  ) {
    if (sponsorCode && dewanyahId) {
      throw new BadRequestException('SPONSOR_AND_DEWANYAH_CONFLICT');
    }

    // ensure game exists
    await this.prisma.game.upsert({
      where: { id: gameId },
      update: {},
      create: { id: gameId, name: gameId, category: 'عام' },
    });

    if (dewanyahId) {
      const dew = await this.prisma.dewanyah.findUnique({
        where: { id: dewanyahId },
        select: {
          id: true,
          status: true,
          ownerUserId: true,
          games: { select: { gameId: true } },
        },
      });
      if (!dew || dew.status !== 'active') {
        throw new NotFoundException('DEWANYAH_NOT_FOUND');
      }

      const isOwner = dew.ownerUserId === hostId;
      if (!isOwner) {
        const member = await this.prisma.dewanyahMember.findUnique({
          where: {
            dewanyahId_userId: {
              dewanyahId,
              userId: hostId,
            },
          },
          select: { status: true },
        });
        if (member?.status !== 'approved') {
          throw new ForbiddenException('DEWANYAH_MEMBERS_ONLY');
        }
      }

      const allowedGames = (dew.games ?? []).map((g) => g.gameId);
      if (allowedGames.length > 0 && !allowedGames.includes(gameId)) {
        throw new BadRequestException('GAME_NOT_IN_DEWANYAH');
      }
    }

    // unique code
    let code = this.newCode();
    while (await this.prisma.room.findUnique({ where: { code } }))
      code = this.newCode();

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
          ...(dewanyahId ? { dewanyahId } : {}),
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
          meta: {
            stake: hostStake,
            sponsorCode: sponsorCode ?? null,
            dewanyahId: dewanyahId ?? null,
          },
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
    const room = (await this.prisma.room.findUnique({
      where: { code },
    })) as any;
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');

    // لا يسمح بالانضمام بعد بدء العداد/الروم
    if (room.status !== 'waiting') {
      throw new BadRequestException('ROOM_NOT_JOINABLE');
    }
    if (this.isLocked(room)) {
      throw new BadRequestException('ROOM_LOCKED');
    }

    if (room.dewanyahId) {
      const dew = await this.prisma.dewanyah.findUnique({
        where: { id: room.dewanyahId },
        select: { ownerUserId: true },
      });
      if (!dew) throw new NotFoundException('DEWANYAH_NOT_FOUND');
      if (dew.ownerUserId !== userId) {
        const member = await this.prisma.dewanyahMember.findUnique({
          where: {
            dewanyahId_userId: {
              dewanyahId: room.dewanyahId,
              userId,
            },
          },
          select: { status: true },
        });
        if (member?.status !== 'approved') {
          throw new ForbiddenException('DEWANYAH_JOIN_APPROVAL_REQUIRED');
        }
      }
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
    const sponsorCode: string | null = room?.sponsorCode ?? null;

    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.roomPlayer.findUnique({
        where: { roomCode_userId: { roomCode: code, userId } },
      });
      if (exists) return;

      if (this.isDafanGame(room.gameId)) {
        const playersCount = await tx.roomPlayer.count({
          where: { roomCode: code },
        });
        if (playersCount >= DAFAN_MAX_PLAYERS) {
          throw new BadRequestException('DAFAN_ROOM_FULL_MAX_6');
        }
      }

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
    params: {
      targetWinPoints?: number;
      allowZeroCredit?: boolean;
      timerSec?: number;
    },
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
    if (room.hostUserId !== hostId)
      throw new ForbiddenException('ONLY_HOST_CAN_START');
    if (room.status !== 'waiting')
      throw new BadRequestException('ALREADY_STARTED');
    if ((room.players?.length ?? 0) < 2)
      throw new BadRequestException('NEED_TWO_PLAYERS');

    if (this.isDafanGame(room.gameId)) {
      const total = room.players?.length ?? 0;
      if (total !== DAFAN_MAX_PLAYERS) {
        throw new BadRequestException('DAFAN_NEEDS_EXACTLY_6_PLAYERS');
      }
      const teamA = room.players.filter((p) => p.team === 'A').length;
      const teamB = room.players.filter((p) => p.team === 'B').length;
      if (teamA !== 3 || teamB !== 3) {
        throw new BadRequestException('DAFAN_NEEDS_TEAM_3V3');
      }
    }

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
    if (room.status !== 'waiting')
      throw new BadRequestException('STAKE_ONLY_BEFORE_START');

    const sponsorCode: string | null = (room as any)?.sponsorCode ?? null;
    const dewanyahId: string | null = (room as any)?.dewanyahId ?? null;

    await this.prisma.$transaction(async (tx) => {
      // refund old stake
      const old = await tx.roomStake.findUnique({
        where: { roomCode_userId: { roomCode: code, userId } },
      });

      if (old) {
        if (sponsorCode)
          await incSponsorPearls(
            tx,
            userId,
            sponsorCode,
            room.gameId,
            old.amount,
          );
        else if (dewanyahId)
          await incDewanyahPearls(
            tx,
            userId,
            dewanyahId,
            room.gameId,
            old.amount,
          );
        else await incGamePearls(tx, userId, room.gameId, old.amount);

        await tx.roomStake.delete({
          where: { roomCode_userId: { roomCode: code, userId } },
        });
      }

      // take new stake
      if (sponsorCode) {
        const p = await getSponsorPearls(tx, userId, sponsorCode, room.gameId);
        if (p < amount)
          throw new BadRequestException('NOT_ENOUGH_PEARLS_SPONSOR');
        await decSponsorPearls(tx, userId, sponsorCode, room.gameId, amount);
      } else if (dewanyahId) {
        const p = await getDewanyahPearls(tx, userId, dewanyahId, room.gameId);
        if (p < amount)
          throw new BadRequestException('NOT_ENOUGH_PEARLS_DEWANYAH');
        if (amount > 0)
          await decDewanyahPearls(tx, userId, dewanyahId, room.gameId, amount);
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
          meta: { amount, sponsorCode, dewanyahId },
        },
      });
    });

    return this.getByCode(code);
  }

  // ---------- teams / leaders ----------
  async setPlayerTeam(
    code: string,
    actorUserId: string,
    playerUserId: string,
    team: $Enums.TeamSide,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: { hostUserId: true, status: true },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (room.hostUserId !== actorUserId)
      throw new ForbiddenException('ONLY_HOST_CAN_SET_TEAM');
    if (room.status !== 'waiting')
      throw new BadRequestException('TEAM_ONLY_BEFORE_START');

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

  async setTeamLeader(
    code: string,
    actorUserId: string,
    team: $Enums.TeamSide,
    leaderUserId: string,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: { hostUserId: true, status: true },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (room.hostUserId !== actorUserId)
      throw new ForbiddenException('ONLY_HOST_CAN_SET_LEADER');
    if (room.status !== 'waiting')
      throw new BadRequestException('LEADER_ONLY_BEFORE_START');

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
    if (room.hostUserId !== hostId)
      throw new ForbiddenException('ONLY_HOST_CAN_SUBMIT');
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
      votes: room.resultVotes.map((v) => ({
        userId: v.userId,
        approve: v.approve,
      })),
      totalPlayers: room.players.length,
    };
  }

  private async finalizeResult(room: any) {
    if (room.resultStatus === $Enums.RoomResultStatus.approved)
      return this.getResultState(room.code);

    const payload = room.resultPayload || {};
    const winners: string[] = Array.isArray(payload.winners)
      ? payload.winners
      : [];
    const losers: string[] = Array.isArray(payload.losers)
      ? payload.losers
      : [];

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
