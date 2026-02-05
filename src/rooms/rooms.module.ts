import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma.service';
import { MatchesService } from '../matches/matches.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, PrismaService, MatchesService],
})
export class RoomsModule {}
// src/rooms/rooms.module.ts
