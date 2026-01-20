import { Controller, Get, Query } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { ok, err } from '../common/api';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly lb: LeaderboardService) {}

  @Get('global')
  async global(@Query('limit') limit?: string) {
    try {
      return ok('Global leaderboard', await this.lb.globalLeaderboard(Number(limit ?? 50)));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Regular (per-game) leaderboard using userGameWallet
  @Get('game')
  async game(@Query('gameId') gameId?: string, @Query('limit') limit?: string) {
    try {
      if (!gameId) return err('Missing gameId', 'BAD_REQUEST');
      return ok('Game leaderboard', await this.lb.gameLeaderboard(gameId, Number(limit ?? 50)));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @Get('sponsor')
  async sponsor(
    @Query('sponsorCode') sponsorCode?: string,
    @Query('gameId') gameId?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!sponsorCode || !gameId) return err('Missing sponsorCode/gameId', 'BAD_REQUEST');
      return ok(
        'Sponsor leaderboard',
        await this.lb.sponsorGameLeaderboard(sponsorCode, gameId, Number(limit ?? 50)),
      );
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }
}
//src/auth/leaderboard/leaderboard.controller.ts 
