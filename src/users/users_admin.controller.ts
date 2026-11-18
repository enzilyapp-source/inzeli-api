import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { ok, err } from '../common/api';
import { AdminGuard } from '../auth/admin.guard';
import { Prisma } from '@prisma/client';

@Controller('admin/users')
export class AdminUsersController {
  constructor(private prisma: PrismaService) {}

  private readonly listSelect = {
    id: true,
    publicId: true,
    username: true,
    email: true,
    phone: true,
    displayName: true,
    createdAt: true,
    permanentScore: true,
    pearls: true,
    isTestAccount: true,
    hideFromLeaderboard: true,
  } as const;

  private async resolveUser(target: string) {
    const key = (target ?? '').trim();
    if (!key) return null;
    const email = key.toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ id: key }, { publicId: key }, { email }],
      },
      select: { id: true, email: true, publicId: true },
    });
    return user;
  }

  // A single aggregate covers every account, independently of the list's
  // search filter / display limit. No user records or private fields are loaded.
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('summary')
  async summary() {
    const groups = await this.prisma.user.groupBy({
      by: ['isTestAccount'],
      _count: { _all: true },
    });
    let totalAccounts = 0;
    let testAccounts = 0;
    for (const group of groups) {
      totalAccounts += group._count._all;
      if (group.isTestAccount) testAccounts += group._count._all;
    }
    return ok('User totals', {
      totalAccounts,
      registeredUsers: totalAccounts - testAccounts,
      testAccounts,
    });
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get()
  async list(@Query('q') q?: string, @Query('limit') limit?: string) {
    try {
      const n = Math.max(1, Math.min(300, Number(limit ?? 100) || 100));
      const query = (q ?? '').trim();

      const where: Prisma.UserWhereInput = query
        ? {
            OR: [
              { email: { contains: query } },
              { phone: { contains: query } },
              { displayName: { contains: query } },
              { id: { contains: query } },
              { publicId: { contains: query } },
              { username: { contains: query.replace(/^@/, '').toLowerCase() } },
            ],
          }
        : {};

      const users = await this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: n,
        select: this.listSelect,
      });
      return ok('Users', users);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Keep old naming used in the admin app: ban/unban
  // Here "ban" means "hide from leaderboard", not account suspension.
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':id/ban')
  async banFromLeaderboard(@Param('id') id: string) {
    try {
      const user = await this.resolveUser(id);
      if (!user) return err('USER_NOT_FOUND', 'USER_NOT_FOUND');
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { hideFromLeaderboard: true },
        select: this.listSelect,
      });
      return ok('User hidden from leaderboard', updated);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':id/unban')
  async unbanFromLeaderboard(@Param('id') id: string) {
    try {
      const user = await this.resolveUser(id);
      if (!user) return err('USER_NOT_FOUND', 'USER_NOT_FOUND');
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { hideFromLeaderboard: false },
        select: this.listSelect,
      });
      return ok('User shown in leaderboard', updated);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }
}
