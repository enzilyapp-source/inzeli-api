import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { SponsorsService } from './sponsors.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';

@Controller('sponsors')
export class SponsorsController {
  constructor(private readonly sponsors: SponsorsService) {}

  @Get()
  async list() {
    try {
      return ok('Sponsors', await this.sponsors.listSponsors());
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @Get(':code')
  async detail(@Param('code') code: string) {
    try {
      return ok('Sponsor', await this.sponsors.getSponsorWithGames(code));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Join/activate a sponsor for the current user (seeds wallets with 5 pearls PER GAME)
  @UseGuards(AuthGuard('jwt'))
  @Post(':code/join')
  async join(@Req() req: any, @Param('code') code: string) {
    try {
      const userId = req.user.userId;
      await this.sponsors.joinSponsor(userId, code);
      return ok('Joined sponsor', { sponsorCode: code });
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Current user's wallets in one sponsor
  @UseGuards(AuthGuard('jwt'))
  @Get(':code/wallets/me')
  async myWallets(@Req() req: any, @Param('code') code: string) {
    try {
      const userId = req.user.userId;
      return ok('Wallets', await this.sponsors.userWallets(userId, code));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Current user's wallets across all sponsors (optional)
  @UseGuards(AuthGuard('jwt'))
  @Get('wallets/me')
  async allMyWallets(@Req() req: any) {
    try {
      const userId = req.user.userId;
      return ok('Wallets', await this.sponsors.userAllWallets(userId));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // ✅ NEW: Sponsor leaderboard per game (shows players pearls + wins/losses + streak)
  // GET /sponsors/:code/leaderboard?gameId=بلوت&limit=50
  @Get(':code/leaderboard')
  async sponsorLeaderboard(
    @Param('code') sponsorCode: string,
    @Query('gameId') gameId?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const n = Math.max(1, Math.min(100, Number(limit ?? 50) || 50));
      if (!gameId || !gameId.trim()) {
        return err('gameId is required', 'GAME_ID_REQUIRED');
      }
      const data = await this.sponsors.sponsorGameLeaderboard({
        sponsorCode,
        gameId: gameId.trim(),
        limit: n,
      });
      return ok('Leaderboard', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // ✅ NEW: Sponsor games with prize (used by SponsorPage)
  // GET /sponsors/:code/games
  @Get(':code/games')
  async sponsorGames(@Param('code') sponsorCode: string) {
    try {
      return ok('Games', await this.sponsors.sponsorGames(sponsorCode));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }
}
