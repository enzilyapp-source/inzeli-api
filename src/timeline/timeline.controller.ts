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
  async list(@Req() req: any, @Query('limit') limit?: string, @Query('gameId') gameId?: string) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      const n = Math.min(Math.max(Number(limit ?? 50), 1), 200);

      const events = await this.prisma.timelineEvent.findMany({
        where: {
          userId,
          ...(gameId ? { gameId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: n,
      });

      return ok(
        'Timeline',
        events.map((e) => ({
          id: e.id,
          userId: e.userId,
          roomCode: e.roomCode,
          gameId: e.gameId,
          kind: e.kind,
          meta: e.meta,
          ts: e.createdAt,
        })),
      );
    } catch (e: any) {
      return err(e?.message || 'Timeline failed', e?.message);
    }
  }
}
