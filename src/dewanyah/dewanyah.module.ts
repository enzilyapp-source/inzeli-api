import { Module } from '@nestjs/common';
import { DewanyahService } from './dewanyah.service';
import { DewanyahController } from './dewanyah.controller';
import { AdminDewanyahController } from './dewanyah_admin.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [DewanyahController, AdminDewanyahController],
  providers: [DewanyahService, PrismaService],
  exports: [DewanyahService],
})
export class DewanyahModule {}
