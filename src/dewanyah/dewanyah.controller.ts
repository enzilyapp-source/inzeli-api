import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, Patch } from '@nestjs/common';
import { DewanyahService } from './dewanyah.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';

@Controller('dewanyah')
export class DewanyahController {
  constructor(private readonly dewanyah: DewanyahService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('requests')
  async createRequest(@Req() req: any, @Body() body: any) {
    try {
      const userId = req.user.userId;
      const name = (body?.name ?? '').trim();
      const contact = (body?.contact ?? '').trim();
      if (!name || !contact) return err('name/contact required', 'VALIDATION');
      const data = await this.dewanyah.createRequest({
        userId,
        name,
        contact,
        gameId: body?.gameId,
        note: body?.note,
        requireApproval: body?.requireApproval,
        locationLock: body?.locationLock,
        radiusMeters: body?.radiusMeters,
      });
      return ok('Request stored', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @Get()
  async list() {
    try {
      return ok('Dewanyah list', await this.dewanyah.listDewanyahs());
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/join')
  async join(@Req() req: any, @Param('id') id: string) {
    try {
      const userId = req.user.userId;
      const data = await this.dewanyah.requestJoin(id, userId);
      return ok('Join recorded', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @Get(':id/leaderboard')
  async leaderboard(@Param('id') id: string, @Query('limit') limit?: string) {
    try {
      const n = Math.max(1, Math.min(100, Number(limit ?? 100) || 100));
      const data = await this.dewanyah.leaderboard(id, n);
      return ok('Leaderboard', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Owner: list members (pending/approved)
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/members')
  async members(@Req() req: any, @Param('id') id: string) {
    try {
      const userId = req.user.userId;
      const data = await this.dewanyah.listMembersForOwner(id, userId);
      return ok('Members', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Owner: set member status
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/members/:userId/status')
  async setMemberStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @Body() body: any,
  ) {
    try {
      const userId = req.user.userId;
      await this.dewanyah.getOwnerDewanyah(id, userId);
      const status = (body?.status ?? '').toString();
      if (status.isEmpty) return err('status required', 'VALIDATION');
      const data = await this.dewanyah.setMemberStatus(id, memberId, status);
      return ok('Status updated', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }
}
