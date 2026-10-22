import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';
import { ok } from '../common/api';
import { PrismaService } from '../prisma.service';
import { MAIN_GAME_IDS } from './main-games';
import { OperationsService } from './operations.service';

@Controller('app-settings')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  @Get()
  async settings() {
    return ok('App settings', await this.operations.settings());
  }
}

@Controller('admin/operations')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminOperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
  ) {}
  @Get()
  async settings() {
    return ok('App settings', await this.operations.settings());
  }

  @Patch('maintenance')
  async maintenance(@Body() body: { enabled?: boolean; message?: string }) {
    if (typeof body.enabled !== 'boolean')
      throw new BadRequestException('enabled must be boolean');
    const message = body.message?.trim();
    if (message !== undefined && (!message || message.length > 500))
      throw new BadRequestException('Message must contain 1–500 characters');
    const data = {
      maintenanceEnabled: body.enabled,
      ...(message ? { maintenanceMessage: message } : {}),
    };
    await this.prisma.appSettings.upsert({
      where: { id: 'main' },
      create: { id: 'main', ...data },
      update: data,
    });
    return ok('Maintenance updated', await this.operations.settings());
  }

  @Get('games')
  async games() {
    return ok(
      'Games',
      await this.prisma.game.findMany({
        where: { id: { in: MAIN_GAME_IDS } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, category: true, mainVisible: true },
      }),
    );
  }

  @Patch('games/:id')
  async game(@Param('id') id: string, @Body() body: { visible?: boolean }) {
    if (typeof body.visible !== 'boolean')
      throw new BadRequestException('visible must be boolean');
    return ok(
      'Game visibility updated',
      await this.prisma.game.update({
        where: { id },
        data: { mainVisible: body.visible },
        select: { id: true, mainVisible: true },
      }),
    );
  }
}
