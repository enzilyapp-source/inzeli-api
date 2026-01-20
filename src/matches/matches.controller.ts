// src/matches/matches.controller.ts
import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';
import { CreateMatchDto } from './dto/create-match.dto';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /**
   * POST /api/matches
   * body:
   * {
   *   roomCode?: string,
   *   gameId: string,
   *   winners: string[],
   *   losers: string[],
   *   sponsorCode?: string
   * }
   */
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Req() _req: any, @Body() dto: CreateMatchDto) {
    try {
      const data = await this.matches.createMatch(dto);
      return ok('Match recorded', data);
    } catch (e: any) {
      return err(
        e?.response?.message || e?.message || 'Match failed',
        e?.message,
      );
    }
  }
}
