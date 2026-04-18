// src/timeline/timeline.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { ok, err } from '../common/api';

function getReqUserId(req: any): string {
  return req?.user?.userId || req?.user?.id || req?.user?.sub || req?.user?.uid;
}

@Controller('timeline')
@UseGuards(AuthGuard('jwt'))
export class TimelineController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('gameId') gameId?: string,
    @Query('scope') scope?: string, // scope=all يجلب كل اللاعبين
  ) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      const n = Math.min(Math.max(Number(limit ?? 200), 1), 300);
      const scopeAll = (scope ?? '').toLowerCase() == 'all';
      const whereClause = {
        ...(scopeAll ? {} : { userId }),
        ...(gameId ? { gameId } : {}),
      };

      const events = await this.prisma.timelineEvent.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: n,
      });

      const filteredEvents = scopeAll
        ? events.filter((e) => {
            const k = (e.kind ?? '').toUpperCase();
            // في الفيد العام نعرض أحداث النتيجة النهائية فقط،
            // ونخفي الأحداث الفردية حتى لا تتكرر نفس المباراة أكثر من مرة.
            if (k === 'MATCH_WIN' || k === 'MATCH_LOSS') return false;
            // تذكيرات الحسم لا نعرضها في شسالفه العام.
            if (k === 'ROOM_RESULT_REMINDER') return false;
            return true;
          })
        : events;

      const dedupedEvents = scopeAll
        ? (() => {
            const seenRoomResult = new Set<string>();
            const out: typeof filteredEvents = [];
            for (const e of filteredEvents) {
              const k = (e.kind ?? '').toUpperCase();
              if (k.startsWith('MATCH') && e.roomCode) {
                const key = `${e.roomCode}|${e.gameId ?? ''}`;
                if (seenRoomResult.has(key)) continue;
                seenRoomResult.add(key);
              }
              out.push(e);
            }
            return out;
          })()
        : filteredEvents;

      // resolve user names (winner/losers/userId) for display
      const ids = new Set<string>();
      dedupedEvents.forEach((e) => {
        if (e.userId) ids.add(e.userId);
        const meta: any = e.meta;
        if (Array.isArray(meta?.winners)) meta.winners.forEach((w: any) => w && ids.add(String(w)));
        if (Array.isArray(meta?.losers)) meta.losers.forEach((l: any) => l && ids.add(String(l)));
      });
      const users =
        ids.size > 0
          ? await this.prisma.user.findMany({
              where: { id: { in: Array.from(ids) } },
              select: { id: true, displayName: true },
            })
          : [];
      const nameMap = new Map(users.map((u) => [u.id, u.displayName]));

      return ok(
        'Timeline',
        dedupedEvents.map((e) => ({
          id: e.id,
          userId: e.userId,
          roomCode: e.roomCode,
          gameId: e.gameId,
          kind: e.kind,
          meta: e.meta,
          winners: Array.isArray((e.meta as any)?.winners)
            ? (e.meta as any).winners.map((w: any) => w?.toString() ?? '')
            : [],
          losers: Array.isArray((e.meta as any)?.losers)
            ? (e.meta as any).losers.map((l: any) => l?.toString() ?? '')
            : [],
          winnersNames: Array.isArray((e.meta as any)?.winners)
            ? (e.meta as any).winners.map((w: any) => nameMap.get(String(w)) ?? String(w))
            : [],
          losersNames: Array.isArray((e.meta as any)?.losers)
            ? (e.meta as any).losers.map((l: any) => nameMap.get(String(l)) ?? String(l))
            : [],
          winner: ((): string | null => {
            if (Array.isArray((e.meta as any)?.winners) && (e.meta as any).winners.length > 0) {
              const id = (e.meta as any).winners[0]?.toString();
              return nameMap.get(id) ?? id ?? null;
            }
            const id = e.userId ?? '';
            return nameMap.get(id) ?? id ?? null;
          })(),
          winnerName: ((): string => {
            if (Array.isArray((e.meta as any)?.winners) && (e.meta as any).winners.length > 0) {
              const id = (e.meta as any).winners[0]?.toString();
              return nameMap.get(id) ?? id ?? '';
            }
            const id = e.userId ?? '';
            return nameMap.get(id) ?? id ?? '';
          })(),
          ts: e.createdAt,
        })),
      );
    } catch (e: any) {
      return err(e?.message || 'Timeline failed', e?.message);
    }
  }
}
