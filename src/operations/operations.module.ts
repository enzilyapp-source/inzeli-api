import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OperationsService } from './operations.service';
import {
  OperationsController,
  AdminOperationsController,
} from './operations.controller';
import { ReportsController } from './reports.controller';

@Global()
@Module({
  controllers: [
    OperationsController,
    AdminOperationsController,
    ReportsController,
  ],
  providers: [PrismaService, OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
