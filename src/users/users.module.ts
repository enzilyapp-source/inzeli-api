// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AdminUsersController } from './users_admin.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [UsersController, AdminUsersController],
  providers: [PrismaService],
})
export class UsersModule {}
