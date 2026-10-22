import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [PrismaService],
})
export class NotificationsModule {}
