import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { APP_NOTIFICATION_KIND } from '../common/app-notifications';
import { err, ok } from '../common/api';
import { PrismaService } from '../prisma.service';

function getReqUserId(req: any): string {
  return req?.user?.userId || req?.user?.id || req?.user?.sub || req?.user?.uid;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    try {
      const userId = getReqUserId(req);
      if (!userId) return err('AUTH_USER_ID_MISSING', 'AUTH_USER_ID_MISSING');

      const take = Math.min(Math.max(Number(limit ?? 100) || 100, 1), 100);
      const after = this.parseSince(since);

      const events = await this.prisma.timelineEvent.findMany({
        where: {
          kind: APP_NOTIFICATION_KIND,
          OR: [{ userId: null }, { userId }],
          createdAt: { gte: new Date(Date.now() - 24 * 3600000), ...(after ? { gt: after } : {}) },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });

      return ok(
        'Notifications',
        events.map((event) => {
          const meta = objectRecord(event.meta);
          const data = objectRecord(meta.data);
          const type =
            (meta.notificationType ?? data.type ?? 'info').toString().trim() ||
            'info';

          return {
            id: event.id,
            type,
            title: (meta.titleAr ?? meta.titleEn ?? '').toString(),
            body: (meta.messageAr ?? meta.messageEn ?? '').toString(),
            createdAt: event.createdAt,
            data,
          };
        }),
      );
    } catch (e: any) {
      return err(e?.message || 'Notifications failed', e?.message);
    }
  }

  private parseSince(value?: string): Date | undefined {
    const raw = (value ?? '').trim();
    if (!raw) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
