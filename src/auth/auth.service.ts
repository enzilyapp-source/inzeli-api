// src/auth/auth.service.ts
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ensureAllGameWallets } from '../common/pearls';

function isBcryptHash(s: string) {
  return typeof s === 'string' && (s.startsWith('$2a$') || s.startsWith('$2b$'));
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // نحول المستخدم لشكل آمن ومتوافق مع Flutter
  private toSafeUser(user: any, extras?: { pearls?: number; gamePearls?: Record<string, number> }) {
    const pearls = extras?.pearls ?? user.pearls ?? user.creditPoints ?? 0;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      permanentScore: user.permanentScore ?? 0,
      // Flutter يتوقع "creditPoints" → نربطه بالـ pearls من الداتا بيز
      creditPoints: pearls,
      pearls,
      creditBalance: user.creditBalance ?? 0,
      themeId: user.themeId ?? null,
      frameId: user.frameId ?? null,
      cardId: user.cardId ?? null,
      ...(extras?.gamePearls ? { gamePearls: extras.gamePearls } : {}),
    };
  }

  private async loadPearlsSnapshot(userId: string) {
    const gamePearls = await ensureAllGameWallets(this.prisma, userId);
    const values = Object.values(gamePearls ?? {});
    const pearls = values.length ? Math.max(...values) : 0;
    return { pearls, gamePearls };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('EMAIL_EXISTS');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: dto.displayName.trim(),
        passwordHash,
        ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}),
        // pearls default = 5 من schema.prisma
      },
    });

    const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { user: this.toSafeUser({ ...user, pearls: pearlsSnapshot.pearls }, pearlsSnapshot), token };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('INVALID_CREDENTIALS');

    const stored = user.passwordHash ?? '';
    let passOk = false;

    if (isBcryptHash(stored)) {
      passOk = await bcrypt.compare(dto.password, stored);
    } else {
      // legacy: باسورد قديم plain
      passOk = stored === dto.password;

      if (passOk) {
        const newHash = await bcrypt.hash(dto.password, 10);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        });
      }
    }

    if (!passOk) throw new UnauthorizedException('INVALID_CREDENTIALS');

    const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { user: this.toSafeUser({ ...user, pearls: pearlsSnapshot.pearls }, pearlsSnapshot), token };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');
    const pearlsSnapshot = await this.loadPearlsSnapshot(userId);
    return this.toSafeUser({ ...user, pearls: pearlsSnapshot.pearls }, pearlsSnapshot);
  }
}
