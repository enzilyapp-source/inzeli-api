import {
  Injectable,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/** Persistent operational controls shared by the public app and admin. */
@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async settings() {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: 'main' },
    });
    const hidden = await this.prisma.game.findMany({
      where: { mainVisible: false },
      select: { id: true },
    });
    return {
      maintenanceEnabled: settings?.maintenanceEnabled ?? false,
      maintenanceMessage:
        settings?.maintenanceMessage ?? 'التطبيق تحت الصيانة، بنرجع لكم قريبًا',
      hiddenGameIds: hidden.map((g) => g.id),
      notificationRetentionHours: 24,
    };
  }

  async assertCanPlay(gameId?: string, scoped = false) {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: 'main' },
    });
    if (settings?.maintenanceEnabled) {
      throw new ServiceUnavailableException(settings.maintenanceMessage);
    }
    // Visibility affects the main games only; sponsor/dewanyah catalogs remain independent.
    if (gameId && !scoped) {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        select: { mainVisible: true },
      });
      if (game?.mainVisible === false)
        throw new BadRequestException('GAME_HIDDEN');
    }
  }
}
