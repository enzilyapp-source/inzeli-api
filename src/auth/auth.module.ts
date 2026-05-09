import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AdminGuard } from './admin.guard';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ||
          '365d') as SignOptions['expiresIn'],
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, PrismaService, AdminGuard],
  controllers: [AuthController],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
//auth/auth.module.ts
