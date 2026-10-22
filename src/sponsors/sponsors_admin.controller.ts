import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { SponsorsService } from './sponsors.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';
import {
  ensureSponsorUploadsDir,
  publicSponsorImagePath,
  SPONSOR_IMAGE_MAX_BYTES,
  SPONSOR_IMAGE_MIME_EXT,
} from '../common/uploads';

function toNumberOrUndefined(v: unknown) {
  if (v == null) return undefined;
  if (typeof v === 'string' && v.trim().length === 0) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function safeFilePrefix(code: string) {
  return (
    code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sponsor'
  );
}

function requestBaseUrl(req: any) {
  const protoHeader = req?.headers?.['x-forwarded-proto'];
  const hostHeader = req?.headers?.['x-forwarded-host'] ?? req?.headers?.host;
  const proto =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)
      ?.toString()
      .split(',')[0]
      .trim() ||
    req?.protocol ||
    'https';
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader)
    ?.toString()
    .split(',')[0]
    .trim();
  return host ? `${proto}://${host}` : '';
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
  @Post(':code/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureSponsorUploadsDir());
        },
        filename: (req: any, file, cb) => {
          const ext =
            SPONSOR_IMAGE_MIME_EXT[file.mimetype] ??
            file.originalname.match(/\.(jpe?g|png|webp)$/i)?.[0]?.toLowerCase();
          cb(
            null,
            `${safeFilePrefix(req.params?.code ?? '')}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`,
          );
        },
      }),
      fileFilter: (_req, file, cb) => {
        const byMime = SPONSOR_IMAGE_MIME_EXT[file.mimetype] != null;
        const byName = /\.(jpe?g|png|webp)$/i.test(file.originalname);
        cb(
          byMime || byName
            ? null
            : new BadRequestException('INVALID_IMAGE_TYPE'),
          byMime || byName,
        );
      },
      limits: { fileSize: SPONSOR_IMAGE_MAX_BYTES },
    }),
  )
  async uploadImage(
    @Param('code') code: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    try {
      if (!file?.filename) return err('image required', 'VALIDATION');
      const imageUrl = `${requestBaseUrl(req)}${publicSponsorImagePath(file.filename)}`;
      const sponsor = await this.sponsors.updateSponsor(code, { imageUrl });
      return ok('Sponsor image uploaded', { imageUrl, sponsor });
    } catch (e: any) {
      const message =
        e?.message === 'LIMIT_FILE_SIZE'
          ? 'IMAGE_TOO_LARGE'
          : e?.message || 'Failed';
      return err(message);
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
