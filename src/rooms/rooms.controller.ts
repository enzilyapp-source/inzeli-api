// src/rooms/rooms.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';

function getReqUserId(req: any): string {
  // Supports different jwt.strategy validate() shapes
  return req?.user?.userId || req?.user?.id || req?.user?.sub || req?.user?.uid;
}

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Req() req: any, @Body() dto: CreateRoomDto) {
    try {
      const hostId = getReqUserId(req);
      if (!hostId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Room created 🎮',
        await this.rooms.createRoom(
          dto.gameId,
          hostId,
          dto.sponsorCode,
          dto.dewanyahId,
          dto.lat,
          dto.lng,
          dto.radiusMeters,
        ),
      );
    } catch (e: any) {
      return err(e?.message || 'Create failed', e?.message);
    }
  }

  @Get(':code')
  async get(@Param('code') code: string) {
    try {
      return ok('Room fetched', await this.rooms.getByCode(code));
    } catch (e: any) {
      return err(
        e?.message || 'Room not found',
        e?.message || 'ROOM_NOT_FOUND',
      );
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('join')
  async join(@Req() req: any, @Body() dto: JoinRoomDto) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Joined room 👌',
        await this.rooms.join(dto.code, userId, dto.lat, dto.lng),
      );
    } catch (e: any) {
      return err(e?.message || 'Join failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/start')
  async start(
    @Req() req: any,
    @Param('code') code: string,
    @Body()
    body: {
      targetWinPoints?: number;
      allowZeroCredit?: boolean;
      timerSec?: number;
    },
  ) {
    try {
      const hostId = getReqUserId(req);
      if (!hostId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Room started 🚀',
        await this.rooms.start(code, hostId, body || {}),
      );
    } catch (e: any) {
      return err(e?.message || 'Start failed', e?.message);
    }
  }

  // نتيجة الروم (يقدّمها المضيف)
  @UseGuards(AuthGuard('jwt'))
  @Post(':code/result')
  async submitResult(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: { winners: string[]; losers: string[] },
  ) {
    try {
      const hostId = getReqUserId(req);
      if (!hostId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Result submitted',
        await this.rooms.submitResult(
          code,
          hostId,
          body || { winners: [], losers: [] },
        ),
      );
    } catch (e: any) {
      return err(e?.message || 'Result submit failed', e?.message);
    }
  }

  // تصويت اللاعبين (موافقة/رفض)
  @UseGuards(AuthGuard('jwt'))
  @Post(':code/result/vote')
  async voteResult(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: { approve: boolean },
  ) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Vote recorded',
        await this.rooms.voteResult(code, userId, !!body?.approve),
      );
    } catch (e: any) {
      return err(e?.message || 'Vote failed', e?.message);
    }
  }

  // حالة النتيجة + الأصوات (للاستطلاع)
  @UseGuards(AuthGuard('jwt'))
  @Get(':code/state')
  async state(@Param('code') code: string) {
    try {
      return ok('Room state', await this.rooms.getResultState(code));
    } catch (e: any) {
      return err(e?.message || 'State failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/stake')
  async setStake(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: { amount: number },
  ) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Points set 💰',
        await this.rooms.setStake(code, userId, Number(body.amount ?? 0)),
      );
    } catch (e: any) {
      return err(e?.message || 'Set points failed', e?.message);
    }
  }

  // تعيين فريق لاعب (للمضيف فقط)
  @UseGuards(AuthGuard('jwt'))
  @Post(':code/team')
  async setTeam(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: { playerUserId: string; team: 'A' | 'B' },
  ) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Team set ✅',
        await this.rooms.setPlayerTeam(
          code,
          userId,
          body.playerUserId,
          body.team as any,
        ),
      );
    } catch (e: any) {
      return err(e?.message || 'Team set failed', e?.message);
    }
  }

  // تعيين قائد فريق (للمضيف فقط)
  @UseGuards(AuthGuard('jwt'))
  @Post(':code/leader')
  async setLeader(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: { team: 'A' | 'B'; leaderUserId: string },
  ) {
    try {
      const userId = getReqUserId(req);
      if (!userId) throw new Error('AUTH_USER_ID_MISSING');
      return ok(
        'Leader set ✅',
        await this.rooms.setTeamLeader(
          code,
          userId,
          body.team as any,
          body.leaderUserId,
        ),
      );
    } catch (e: any) {
      return err(e?.message || 'Leader set failed', e?.message);
    }
  }
}
