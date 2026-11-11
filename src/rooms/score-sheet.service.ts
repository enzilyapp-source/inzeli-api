import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OperationsService } from '../operations/operations.service';

const GAME_KINDS: Record<string, string | null> = {
  كوت: 'kout',
  بلوت: 'baloot',
  تريكس: 'trix',
  هند: 'hand',
  سبيتة: 'spita',
  اونو: null,
  دفان: null,
};
const STORAGE: Record<string, string> = {
  general: 'jinjfa_score_v1',
  hand: 'qaed.hand.v1',
  kout: 'qaed.kout.v1',
  baloot: 'qaed.baloot.v1',
  spita: 'qaed.spita.v1',
  trix: 'qaed.trix.v1',
};

@Injectable()
export class ScoreSheetService {
  constructor(
    private prisma: PrismaService,
    private operations: OperationsService,
  ) {}

  private async room(code: string, userId: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: {
        code: true,
        gameId: true,
        status: true,
        hostUserId: true,
        players: {
          select: { userId: true, team: true },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!room) throw new NotFoundException('ROOM_NOT_FOUND');
    if (
      !userId ||
      (room.hostUserId !== userId &&
        !room.players.some((p) => p.userId === userId))
    )
      throw new ForbiddenException('SCORE_SHEET_MEMBERS_ONLY');
    if (!Object.prototype.hasOwnProperty.call(GAME_KINDS, room.gameId))
      throw new BadRequestException('SCORE_SHEET_GAME_UNSUPPORTED');
    return room;
  }

  async read(code: string, userId: string) {
    const room = await this.room(code, userId);
    const sheet = await this.prisma.roomScoreSheet.findUnique({
      where: { roomCode: code },
    });
    return {
      revision: sheet?.revision ?? 0,
      snapshot: sheet?.snapshot ?? null,
      canEdit: room.hostUserId === userId && room.status === 'running',
      status: room.status,
    };
  }

  // Photos are fetched once on opening, never added to the polled ledger.
  async roster(code: string, userId: string) {
    await this.room(code, userId);
    return this.prisma.roomPlayer.findMany({
      where: { roomCode: code },
      orderBy: { joinedAt: 'asc' },
      select: {
        userId: true,
        team: true,
        user: {
          select: { displayName: true, avatarPath: true, avatarBase64: true },
        },
      },
    });
  }

  async write(code: string, userId: string, body: any) {
    await this.operations.assertCanPlay();
    const room = await this.room(code, userId);
    if (room.hostUserId !== userId)
      throw new ForbiddenException('SCORE_SHEET_HOST_ONLY');
    if (room.status !== 'running')
      throw new BadRequestException('SCORE_SHEET_ROOM_NOT_RUNNING');
    const { revision, snapshot } = body ?? {};
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      !snapshot ||
      typeof snapshot !== 'object' ||
      Array.isArray(snapshot)
    )
      throw new BadRequestException('SCORE_SHEET_INVALID');
    const { kind, rosterIds, teamMode, teams, storage } = snapshot;
    if (
      (kind !== 'general' && kind !== GAME_KINDS[room.gameId]) ||
      !Object.prototype.hasOwnProperty.call(STORAGE, kind)
    )
      throw new BadRequestException('SCORE_SHEET_KIND_INVALID');
    if (
      typeof teamMode !== 'boolean' ||
      !Array.isArray(rosterIds) ||
      rosterIds.length < 2 ||
      new Set(rosterIds).size !== rosterIds.length ||
      rosterIds.length !== room.players.length ||
      rosterIds.some(
        (id) =>
          typeof id !== 'string' || !room.players.some((p) => p.userId === id),
      )
    )
      throw new BadRequestException('SCORE_SHEET_ROSTER_INVALID');
    if (
      !teams ||
      typeof teams !== 'object' ||
      Array.isArray(teams) ||
      Object.keys(teams).length !== rosterIds.length ||
      rosterIds.some((id) =>
        teamMode
          ? !['A', 'B'].includes(teams[id]) ||
            room.players.find((p) => p.userId === id)?.team !== teams[id]
          : teams[id] !== null,
      )
    )
      throw new BadRequestException('SCORE_SHEET_TEAMS_INVALID');
    if (
      (['kout', 'baloot'].includes(kind) && !teamMode) ||
      (kind === 'trix' && rosterIds.length !== 4) ||
      (teamMode &&
        (!Object.values(teams).includes('A') ||
          !Object.values(teams).includes('B')))
    )
      throw new BadRequestException('SCORE_SHEET_MODE_INVALID');
    if (
      !storage ||
      typeof storage !== 'object' ||
      Array.isArray(storage) ||
      Object.keys(storage).length !== 1 ||
      typeof storage[STORAGE[kind]] !== 'string'
    )
      throw new BadRequestException('SCORE_SHEET_STORAGE_INVALID');
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 256_000)
      throw new BadRequestException('SCORE_SHEET_TOO_LARGE');
    try {
      JSON.parse(storage[STORAGE[kind]]);
    } catch {
      throw new BadRequestException('SCORE_SHEET_STORAGE_INVALID');
    }

    // A retry after a lost HTTP response may already have been saved. Acknowledge
    // identical data without a second revision; genuinely different data conflicts.
    const acknowledgeExisting = async () => {
      const existing = await this.prisma.roomScoreSheet.findUnique({
        where: { roomCode: code },
      });
      const canonical = (value: unknown) =>
        JSON.stringify(value, (_key, item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item))
            return item;
          return Object.keys(item)
            .sort()
            .reduce(
              (sorted, key) => {
                sorted[key] = item[key];
                return sorted;
              },
              {} as Record<string, unknown>,
            );
        });
      if (existing && canonical(existing.snapshot) === canonical(snapshot))
        return {
          revision: existing.revision,
          snapshot: existing.snapshot,
          canEdit: true,
          status: room.status,
        };
      throw new ConflictException('SCORE_SHEET_CONFLICT');
    };
    // Compare-and-set, never an unconditional upsert.

    if (revision === 0) {
      try {
        await this.prisma.roomScoreSheet.create({
          data: { roomCode: code, revision: 1, snapshot },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') return acknowledgeExisting();
        throw e;
      }
    } else {
      const result = await this.prisma.roomScoreSheet.updateMany({
        where: { roomCode: code, revision },
        data: { revision: { increment: 1 }, snapshot },
      });
      if (!result.count) return acknowledgeExisting();
    }
    return {
      revision: revision + 1,
      snapshot,
      canEdit: true,
      status: room.status,
    };
  }
}
