import { Module } from '@nestjs/common';
import { SponsorsController } from './sponsors.controller';
import { SponsorsAdminController } from './sponsors_admin.controller';
import { SponsorsService } from './sponsors.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SponsorsController, SponsorsAdminController],
  providers: [SponsorsService, PrismaService],
  exports: [SponsorsService],
})
export class SponsorsModule {}
//sponsors/sponsores.module.ts
