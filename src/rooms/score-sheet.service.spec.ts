import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ScoreSheetService } from './score-sheet.service';

function setup() {
  const room = {
    code: 'ABCD',
    gameId: 'هند',
    status: 'running',
    hostUserId: 'host',
    players: [
      { userId: 'host', team: 'A' },
      { userId: 'guest', team: 'B' },
    ],
  };
  let stored: any = null;
  const prisma: any = {
    room: { findUnique: jest.fn(async () => room) },
    roomScoreSheet: {
      findUnique: jest.fn(async () => stored),
      create: jest.fn(async ({ data }: any) => {
        if (stored) throw { code: 'P2002' };
        stored = { ...data };
        return stored;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!stored || stored.revision !== where.revision) return { count: 0 };
        stored = {
          ...stored,
          revision: stored.revision + 1,
          snapshot: data.snapshot,
        };
        return { count: 1 };
      }),
    },
    roomPlayer: { findMany: jest.fn(async () => []) },
  };
  const operations: any = { assertCanPlay: jest.fn(async () => {}) };
  const service = new ScoreSheetService(prisma, operations);
  const snapshot: any = {
    kind: 'hand',
    rosterIds: ['host', 'guest'],
    teamMode: false,
    teams: { host: null, guest: null },
    storage: { 'qaed.hand.v1': JSON.stringify({ version: 1, rounds: [] }) },
  };
  return { service, prisma, room, snapshot };
}
describe('Optional room score sheet', () => {
  it('allows room members to read but only the host can write', async () => {
    const { service, snapshot, prisma } = setup();
    expect((await service.read('ABCD', 'guest')).canEdit).toBe(false);
    await expect(service.read('ABCD', 'outsider')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.write('ABCD', 'guest', { revision: 0, snapshot }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.roomScoreSheet.create).not.toHaveBeenCalled();
    expect(
      (await service.write('ABCD', 'host', { revision: 0, snapshot })).revision,
    ).toBe(1);
    expect((await service.read('ABCD', 'guest')).snapshot).toEqual(snapshot);
  });
  it('never overwrites a newer revision, including duplicate initial requests', async () => {
    const { service, snapshot } = setup();
    await service.write('ABCD', 'host', { revision: 0, snapshot });
    await expect(
      service.write('ABCD', 'host', { revision: 0, snapshot }),
    ).resolves.toMatchObject({ revision: 1 });
    const different = {
      ...snapshot,
      storage: { 'qaed.hand.v1': '{"other":true}' },
    };
    const races = await Promise.allSettled([
      service.write('ABCD', 'host', { revision: 1, snapshot }),
      service.write('ABCD', 'host', { revision: 1, snapshot: different }),
    ]);
    expect(races.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(races.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await service.read('ABCD', 'guest')).revision).toBe(2);
  });
  it('limits game kinds, the actual roster and server-side teams', async () => {
    const { service, snapshot, room } = setup();
    for (const update of [
      { kind: 'trix' },
      { rosterIds: ['host', 'alien'] },
      { teams: { host: 'A', guest: 'B' } },
      { teamMode: true, teams: { host: 'B', guest: 'A' } },
      { storage: { arbitrary: '{}' } },
    ])
      await expect(
        service.write('ABCD', 'host', {
          revision: 0,
          snapshot: { ...snapshot, ...update },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    room.gameId = 'اونو';
    await expect(
      service.write('ABCD', 'host', { revision: 0, snapshot }),
    ).rejects.toBeInstanceOf(BadRequestException);
    snapshot.kind = 'general';
    snapshot.storage = { jinjfa_score_v1: '{}' };
    await expect(
      service.write('ABCD', 'host', { revision: 0, snapshot }),
    ).resolves.toMatchObject({ revision: 1 });
  });
  it('cannot modify cancelled/completed or waiting games', async () => {
    const { service, snapshot, room } = setup();
    for (const status of ['waiting', 'cancelled', 'finished']) {
      room.status = status;
      await expect(
        service.write('ABCD', 'host', { revision: 0, snapshot }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((await service.read('ABCD', 'host')).canEdit).toBe(false);
    }
  });
  it('rejects oversized snapshots and never touches results, wallets or matches', async () => {
    const { service, snapshot, prisma } = setup();
    snapshot.storage['qaed.hand.v1'] = JSON.stringify({
      large: 'x'.repeat(256001),
    });
    await expect(
      service.write('ABCD', 'host', { revision: 0, snapshot }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.roomScoreSheet.create).not.toHaveBeenCalled();
    expect(prisma.room.findUnique).toHaveBeenCalled();
  });
});
