// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AdminUsersController } from './users_admin.controller';
import { AdminUsersNotificationsController } from './users_notifications_admin.controller';
import { PrismaService } from '../prisma.service';
import { SeasonResetService } from './season_reset.service';

@Module({
  controllers: [
    UsersController,
    AdminUsersController,
    AdminUsersNotificationsController,
  ],
  providers: [PrismaService, SeasonResetService],
})
export class UsersModule {}
