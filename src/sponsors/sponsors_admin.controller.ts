import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SponsorsService } from './sponsors.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';

function toNumberOrUndefined(v: unknown) {
  if (v == null) return undefined;
  if (typeof v === 'string' && v.trim().length === 0) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

@Controller('admin/sponsors')
export class SponsorsAdminController {
  constructor(private readonly sponsors: SponsorsService) {}

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get()
  async list() {
    try {
      return ok('Sponsors', await this.sponsors.listSponsorsWithGames());
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Post()
  async create(@Body() body: any) {
    try {
      const code = (body?.code ?? '').trim();
      const name = (body?.name ?? '').trim();
      if (!code || !name) return err('code/name required', 'VALIDATION');
      const s = await this.sponsors.createSponsor(code, name, {
        imageUrl: body?.imageUrl,
        themePrimary: body?.themePrimary,
        themeAccent: body?.themeAccent,
        locationLock: body?.locationLock,
        radiusMeters: toNumberOrUndefined(
          body?.lockRadius ?? body?.radiusMeters,
        ),
        anchorLat: toNumberOrUndefined(body?.anchorLat ?? body?.lockLat),
        anchorLng: toNumberOrUndefined(body?.anchorLng ?? body?.lockLng),
      });
      return ok('Created sponsor', s);
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':code')
  async update(@Param('code') code: string, @Body() body: any) {
    try {
      const data = {
        name: body?.name,
        imageUrl: body?.imageUrl,
        themePrimary: body?.themePrimary,
        themeAccent: body?.themeAccent,
        locationLock: body?.locationLock,
        radiusMeters: toNumberOrUndefined(
          body?.lockRadius ?? body?.radiusMeters,
        ),
        anchorLat: toNumberOrUndefined(body?.anchorLat ?? body?.lockLat),
        anchorLng: toNumberOrUndefined(body?.anchorLng ?? body?.lockLng),
      };
      const s = await this.sponsors.updateSponsor(code, data);
      return ok('Updated sponsor', s);
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Delete(':code')
  async delete(@Param('code') code: string) {
    try {
      await this.sponsors.deleteSponsor(code);
      return ok('Deleted sponsor', { code });
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Post(':code/games')
  async addGame(@Param('code') code: string, @Body() body: any) {
    try {
      const gameId = (body?.gameId ?? '').trim();
      const prizeAmount = body?.prizeAmount as number | undefined;
      if (!gameId) return err('gameId required', 'VALIDATION');
      const g = await this.sponsors.addGameToSponsor(code, gameId, prizeAmount);
      return ok('Game added', g);
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get(':code/monthly-leaders')
  async monthlyLeaders(@Param('code') code: string) {
    try {
      return ok(
        'Sponsor monthly leaders',
        await this.sponsors.currentMonthlyLeadersForSponsor(code),
      );
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Post(':code/monthly-leaders/snapshot')
  async snapshotMonthlyLeaders(@Param('code') code: string) {
    try {
      return ok(
        'Sponsor monthly leaders snapshot saved',
        await this.sponsors.snapshotSponsorMonthlyLeaders(code),
      );
    } catch (e: any) {
      return err(e?.message || 'Failed');
    }
  }
}
