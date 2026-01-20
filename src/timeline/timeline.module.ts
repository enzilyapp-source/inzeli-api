// src/timeline/timeline.module.ts
import { Module } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TimelineController],
  providers: [PrismaService],
})
export class TimelineModule {}
