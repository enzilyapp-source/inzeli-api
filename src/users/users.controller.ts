// src/users/users.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  Delete,
  HttpCode,
  Patch,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { ok, err } from '../common/api';
import { ensureAllGameWallets, getPearls } from '../common/pearls';
import { Prisma } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  private readonly _publicUserSelect = {
    id: true,
    publicId: true,
    email: true,
    displayName: true,
    themeId: true,
    frameId: true,
    cardId: true,
    avatarBase64: true,
    avatarPath: true,
    permanentScore: true,
    createdAt: true,
  } as const;

  @UseGuards(AuthGuard('jwt'))
  @Delete('me')
  @HttpCode(200)
  async deleteMe(@Req() req: any) {
    const userId = req.user.userId;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Remove any dewanyahs owned by the user to avoid orphaned records
        await tx.dewanyah.deleteMany({ where: { ownerUserId: userId } });

        // Clean up all relations that might block user deletion
        await tx.dewanyahRequest.deleteMany({ where: { userId } });
        await tx.dewanyahMember.deleteMany({ where: { userId } });
        await tx.roomPlayer.deleteMany({ where: { userId } });
        await tx.roomStake.deleteMany({ where: { userId } });
        await tx.room.deleteMany({ where: { hostUserId: userId } });
        await tx.matchParticipant.deleteMany({ where: { userId } });
        await tx.timelineEvent.deleteMany({ where: { userId } });
        await tx.userItem.deleteMany({ where: { userId } });
        await tx.userSponsor.deleteMany({ where: { userId } });
        await tx.userGameStat.deleteMany({ where: { userId } });
        await tx.userGameWallet.deleteMany({ where: { userId } });
        await tx.sponsorGameWallet.deleteMany({ where: { userId } });
        await tx.sponsorGameStat.deleteMany({ where: { userId } });

        // Finally, delete the user
        await tx.user.delete({ where: { id: userId } });
      });

      return ok('Account deleted', { deleted: true });
    } catch (e: any) {
      const msg = e?.message || 'Failed to delete account';
      return err(msg, 'DELETE_FAILED');
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: any) {
    try {
      const userId = req.user.userId;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: this._publicUserSelect,
      });

      if (!user) return err('USER_NOT_FOUND', 'USER_NOT_FOUND');

      const gamePearls = await ensureAllGameWallets(this.prisma, userId);
      const pearls = await getPearls(this.prisma, userId);

      return ok('Me', {
        ...user,
        pearls,
        gamePearls,
        creditPoints: pearls, // optional for old flutter UI
      });
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  async updateMe(@Req() req: any, @Body() body: any) {
    try {
      const userId = req.user.userId as string;

      const cleanNullable = (v: unknown) => {
        if (v == null) return null;
        if (typeof v !== 'string') return null;
        const s = v.trim();
        return s.length ? s : null;
      };

      const updates: Prisma.UserUpdateInput = {};
      const displayName = cleanNullable(body?.displayName);
      if (displayName !== null) updates.displayName = displayName.slice(0, 40);

      const avatarBase64 = cleanNullable(body?.avatarBase64);
      if (avatarBase64 !== null) {
        // keep payload bounded to avoid oversized profile blobs.
        updates.avatarBase64 = avatarBase64.slice(0, 1_500_000);
      }

      const avatarPath = cleanNullable(body?.avatarPath);
      if (avatarPath !== null) updates.avatarPath = avatarPath.slice(0, 512);

      if (body && Object.prototype.hasOwnProperty.call(body, 'themeId')) {
        const v = cleanNullable(body.themeId);
        updates.themeId = v ?? null;
      }
      if (body && Object.prototype.hasOwnProperty.call(body, 'frameId')) {
        const v = cleanNullable(body.frameId);
        updates.frameId = v ?? null;
      }
      if (body && Object.prototype.hasOwnProperty.call(body, 'cardId')) {
        const v = cleanNullable(body.cardId);
        updates.cardId = v ?? null;
      }

      if (Object.keys(updates).length === 0) {
        const current = await this.prisma.user.findUnique({
          where: { id: userId },
          select: this._publicUserSelect,
        });
        if (!current) return err('USER_NOT_FOUND', 'USER_NOT_FOUND');
        return ok('No changes', current);
      }

      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: updates,
        select: this._publicUserSelect,
      });
      return ok('Profile updated', updated);
    } catch (e: any) {
      return err(e?.message || 'Failed to update profile', e?.message);
    }
  }

  @Get()
  async getMany(@Query('ids') idsRaw?: string) {
    const ids = (idsRaw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 100);
    if (!ids.length) return ok('Users', []);

    const users = await this.prisma.user.findMany({
      where: { OR: [{ id: { in: ids } }, { publicId: { in: ids } }] },
      select: this._publicUserSelect,
    });
    return ok('Users', users);
  }

  @Get('search/:q')
  async search(@Param('q') q: string) {
    const query = q.trim();
    if (!query) return ok('Users', []);
    const where: Prisma.UserWhereInput = {
      OR: [
        { email: { contains: query } },
        { displayName: { contains: query } },
        { id: { contains: query } },
        { publicId: { contains: query } },
      ],
    };
    const users = await this.prisma.user.findMany({
      where,
      take: 20,
      select: this._publicUserSelect,
      orderBy: { createdAt: 'desc' },
    });
    return ok('Users', users);
  }

  @Get(':id/stats')
  async stats(@Param('id') id: string) {
    try {
      const wins = await this.prisma.matchParticipant.count({
        where: { userId: id, outcome: 'WIN' },
      });

      const losses = await this.prisma.matchParticipant.count({
        where: { userId: id, outcome: 'LOSS' },
      });

      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          publicId: true,
          displayName: true,
          permanentScore: true,
          avatarBase64: true,
          avatarPath: true,
          themeId: true,
        },
      });

      if (!user) return err('USER_NOT_FOUND', 'USER_NOT_FOUND');

      const gamePearls = await ensureAllGameWallets(this.prisma, id);
      const pearls = await getPearls(this.prisma, id);

      return ok('Stats', {
        userId: id,
        publicId: user.publicId ?? null,
        displayName: user.displayName ?? null,
        avatarBase64: user.avatarBase64 ?? null,
        avatarPath: user.avatarPath ?? null,
        themeId: user.themeId ?? null,
        wins,
        losses,
        permanentScore: user.permanentScore ?? 0,
        pearls,
        gamePearls,
        creditPoints: pearls,
      });
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }
}
