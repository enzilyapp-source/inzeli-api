// src/users/users.controller.ts
import { Controller, Get, Param, UseGuards, Req, Delete, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { ok, err } from '../common/api';
import { ensureAllGameWallets, getPearls } from '../common/pearls';
import { Prisma } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

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
        select: {
          id: true,
          email: true,
          displayName: true,
          permanentScore: true,
          createdAt: true,
        },
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

  @Get('search/:q')
  async search(@Param('q') q: string) {
    const query = q.trim();
    if (!query) return ok('Users', []);
    const where: Prisma.UserWhereInput = {
      OR: [
        { email: { contains: query } },
        { displayName: { contains: query } },
        { id: { contains: query } },
      ],
    };
    const users = await this.prisma.user.findMany({
      where,
      take: 20,
      select: { id: true, email: true, displayName: true },
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
        select: { id: true, permanentScore: true },
      });

      if (!user) return err('USER_NOT_FOUND', 'USER_NOT_FOUND');

      const gamePearls = await ensureAllGameWallets(this.prisma, id);
      const pearls = await getPearls(this.prisma, id);

      return ok('Stats', {
        userId: id,
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
