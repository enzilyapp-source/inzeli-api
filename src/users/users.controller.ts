// src/users/users.controller.ts
import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { ok, err } from '../common/api';
import { ensureAllGameWallets, getPearls } from '../common/pearls';
import { Prisma } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

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
