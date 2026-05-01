// src/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RequestRegisterOtpDto } from './dto/request-register-otp.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { ensureAllGameWallets } from '../common/pearls';
import { badgeSnapshot } from '../common/badges';
import { createHmac, randomInt } from 'crypto';

const REGISTER_OTP_PURPOSE = 'register';

type RegisterOtpPayload = {
  email: string;
  displayName: string;
  phone: string;
  passwordHash: string;
  birthDate?: string;
};

function isBcryptHash(s: string) {
  return (
    typeof s === 'string' && (s.startsWith('$2a$') || s.startsWith('$2b$'))
  );
}

function csvToSet(raw: string | undefined, fallback: string[] = []) {
  const src = (raw ?? '').trim();
  if (!src) return new Set(fallback.map((x) => x.trim().toLowerCase()));
  return new Set(
    src
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length > 0),
  );
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private normalizeDisplayName(displayName: string) {
    const clean = displayName.trim();
    if (!clean) throw new BadRequestException('DISPLAY_NAME_REQUIRED');
    return clean.slice(0, 40);
  }

  private normalizePhone(rawPhone: string) {
    let s = (rawPhone ?? '').trim();
    if (!s) throw new BadRequestException('PHONE_REQUIRED');

    s = s.replace(/[\s-]/g, '');
    if (s.startsWith('00')) s = `+${s.slice(2)}`;

    if (s.startsWith('+')) {
      const digits = s.slice(1).replace(/\D/g, '');
      s = `+${digits}`;
    } else {
      const digits = s.replace(/\D/g, '');
      if (!digits) throw new BadRequestException('INVALID_PHONE');

      if (digits.startsWith('965') && digits.length === 11) {
        s = `+${digits}`;
      } else if (digits.length === 8) {
        // default local Kuwait format
        s = `+965${digits}`;
      } else {
        s = `+${digits}`;
      }
    }

    if (!/^\+[1-9]\d{7,14}$/.test(s)) {
      throw new BadRequestException('INVALID_PHONE');
    }
    return s;
  }

  private otpTtlSec() {
    const parsed = Number(process.env.AUTH_OTP_TTL_SEC ?? 300);
    if (!Number.isFinite(parsed)) return 300;
    return Math.min(900, Math.max(60, Math.trunc(parsed)));
  }

  private otpMaxAttempts() {
    const parsed = Number(process.env.AUTH_OTP_MAX_ATTEMPTS ?? 5);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(10, Math.max(3, Math.trunc(parsed)));
  }

  private otpRateWindowSec() {
    const parsed = Number(process.env.AUTH_OTP_RATE_WINDOW_SEC ?? 45);
    if (!Number.isFinite(parsed)) return 45;
    return Math.min(300, Math.max(15, Math.trunc(parsed)));
  }

  private otpHashSecret() {
    return process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || 'dev-otp';
  }

  private hashOtp(phone: string, purpose: string, code: string) {
    return createHmac('sha256', this.otpHashSecret())
      .update(`${phone}:${purpose}:${code}`)
      .digest('hex');
  }

  private generateOtpCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private testAccountEmails() {
    return csvToSet(process.env.AUTH_TEST_ACCOUNT_EMAILS, [
      'review@enzily.app',
      'review@inzeli.app',
      'test1@test.com',
      'test2@test.com',
      'test3@test.com',
      'test4@test.com',
    ]);
  }

  private testAccountPhones() {
    return csvToSet(process.env.AUTH_TEST_ACCOUNT_PHONES);
  }

  private isTestRegistrationCandidate(email: string, phone: string) {
    const byEmail = this.testAccountEmails().has(email.toLowerCase());
    const byPhone = this.testAccountPhones().has(phone.toLowerCase());
    return byEmail || byPhone;
  }

  private async sendOtpSms(phone: string, code: string) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;

    if (!sid || !token || !from) {
      throw new BadRequestException('OTP_PROVIDER_NOT_CONFIGURED');
    }

    const minutes = Math.max(1, Math.round(this.otpTtlSec() / 60));
    const body = `Inzeli verification code: ${code}. Valid for ${minutes} minute(s).`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: from,
          Body: body,
        }).toString(),
      },
    );

    if (!response.ok) {
      const details = await response.text();
      console.error('OTP_SEND_FAILED', response.status, details);
      throw new BadRequestException('OTP_SEND_FAILED');
    }
  }

  // نحول المستخدم لشكل آمن ومتوافق مع Flutter
  private toSafeUser(
    user: any,
    extras?: {
      pearls?: number;
      gamePearls?: Record<string, number>;
      badges?: any[];
      badgeCounts?: Record<string, number>;
      bestBadge?: any;
    },
  ) {
    const pearls = extras?.pearls ?? user.pearls ?? user.creditPoints ?? 0;
    return {
      id: user.id,
      publicId: user.publicId ?? null,
      email: user.email,
      phone: user.phone ?? null,
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
      isTestAccount: user.isTestAccount ?? false,
      displayName: user.displayName,
      permanentScore: user.permanentScore ?? 0,
      // Flutter يتوقع "creditPoints" → نربطه بالـ pearls من الداتا بيز
      creditPoints: pearls,
      pearls,
      creditBalance: user.creditBalance ?? 0,
      themeId: user.themeId ?? null,
      frameId: user.frameId ?? null,
      cardId: user.cardId ?? null,
      avatarBase64: user.avatarBase64 ?? null,
      avatarPath: user.avatarPath ?? null,
      ...(extras?.gamePearls ? { gamePearls: extras.gamePearls } : {}),
      ...(extras?.badges ? { badges: extras.badges } : {}),
      ...(extras?.badgeCounts ? { badgeCounts: extras.badgeCounts } : {}),
      ...(extras?.bestBadge ? { bestBadge: extras.bestBadge } : {}),
    };
  }

  private async loadPearlsSnapshot(userId: string) {
    const gamePearls = await ensureAllGameWallets(this.prisma, userId);
    const values = Object.values(gamePearls ?? {});
    const pearls = values.length ? Math.max(...values) : 0;
    const badges = await badgeSnapshot(this.prisma, userId);
    return { pearls, gamePearls, ...badges };
  }

  private async assertEmailPhoneAvailable(email: string, phone: string) {
    const existsByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existsByEmail) throw new BadRequestException('EMAIL_EXISTS');

    const existsByPhone = await this.prisma.user.findFirst({
      where: { phone },
      select: { id: true },
    });
    if (existsByPhone) throw new BadRequestException('PHONE_EXISTS');
  }

  private async createUserAndToken(
    payload: RegisterOtpPayload,
    isTestAccount: boolean,
  ) {
    const user = await this.prisma.user.create({
      data: {
        email: payload.email,
        phone: payload.phone,
        phoneVerifiedAt: new Date(),
        isTestAccount,
        displayName: payload.displayName,
        passwordHash: payload.passwordHash,
        ...(payload.birthDate
          ? { birthDate: new Date(payload.birthDate) }
          : {}),
      },
    });

    const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });

    return {
      user: this.toSafeUser(
        { ...user, pearls: pearlsSnapshot.pearls },
        pearlsSnapshot,
      ),
      token,
    };
  }

  async requestRegisterOtp(dto: RequestRegisterOtpDto) {
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);
    const displayName = this.normalizeDisplayName(dto.displayName);

    await this.assertEmailPhoneAvailable(email, phone);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const payload: RegisterOtpPayload = {
      email,
      phone,
      displayName,
      passwordHash,
      ...(dto.birthDate ? { birthDate: dto.birthDate } : {}),
    };

    // Explicitly allow specific test/review accounts to be created without OTP.
    if (this.isTestRegistrationCandidate(email, phone)) {
      const account = await this.createUserAndToken(payload, true);
      return { ...account, bypassOtp: true };
    }

    const rateWindowSec = this.otpRateWindowSec();
    const recent = await this.prisma.authOtpChallenge.findFirst({
      where: {
        phone,
        purpose: REGISTER_OTP_PURPOSE,
        createdAt: {
          gte: new Date(Date.now() - rateWindowSec * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (recent) throw new BadRequestException('OTP_RATE_LIMIT');

    const otp = this.generateOtpCode();
    const ttlSec = this.otpTtlSec();
    const challenge = await this.prisma.authOtpChallenge.create({
      data: {
        phone,
        purpose: REGISTER_OTP_PURPOSE,
        codeHash: this.hashOtp(phone, REGISTER_OTP_PURPOSE, otp),
        expiresAt: new Date(Date.now() + ttlSec * 1000),
        maxAttempts: this.otpMaxAttempts(),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    try {
      await this.sendOtpSms(phone, otp);
    } catch (e) {
      await this.prisma.authOtpChallenge
        .delete({ where: { id: challenge.id } })
        .catch(() => null);
      throw e;
    }

    return {
      otpRequired: true,
      requestId: challenge.id,
      expiresInSec: ttlSec,
      ...(process.env.AUTH_DEBUG_OTP === 'true' ? { debugCode: otp } : {}),
    };
  }

  async verifyRegisterOtp(dto: VerifyRegisterOtpDto) {
    const challenge = await this.prisma.authOtpChallenge.findUnique({
      where: { id: dto.requestId },
    });

    if (!challenge || challenge.purpose !== REGISTER_OTP_PURPOSE) {
      throw new BadRequestException('OTP_NOT_FOUND');
    }
    if (challenge.usedAt) throw new BadRequestException('OTP_ALREADY_USED');
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP_EXPIRED');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException('OTP_TOO_MANY_ATTEMPTS');
    }

    const expectedHash = this.hashOtp(
      challenge.phone,
      challenge.purpose,
      dto.code,
    );
    if (expectedHash !== challenge.codeHash) {
      await this.prisma.authOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('OTP_INVALID');
    }

    const raw = challenge.payload as Record<string, unknown> | null;
    const email = typeof raw?.email === 'string' ? raw.email : '';
    const phone = typeof raw?.phone === 'string' ? raw.phone : '';
    const displayName =
      typeof raw?.displayName === 'string' ? raw.displayName : '';
    const passwordHash =
      typeof raw?.passwordHash === 'string' ? raw.passwordHash : '';
    const birthDate =
      typeof raw?.birthDate === 'string' ? raw.birthDate : undefined;

    if (!email || !phone || !displayName || !passwordHash) {
      throw new BadRequestException('OTP_PAYLOAD_INVALID');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.authOtpChallenge.findUnique({
        where: { id: challenge.id },
      });

      if (!fresh || fresh.usedAt) {
        throw new BadRequestException('OTP_ALREADY_USED');
      }
      if (fresh.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('OTP_EXPIRED');
      }

      const existsByEmail = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existsByEmail) throw new BadRequestException('EMAIL_EXISTS');

      const existsByPhone = await tx.user.findFirst({
        where: { phone },
        select: { id: true },
      });
      if (existsByPhone) throw new BadRequestException('PHONE_EXISTS');

      const created = await tx.user.create({
        data: {
          email,
          phone,
          phoneVerifiedAt: new Date(),
          isTestAccount: false,
          displayName,
          passwordHash,
          ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
        },
      });

      await tx.authOtpChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });

      return created;
    });

    const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return {
      user: this.toSafeUser(
        { ...user, pearls: pearlsSnapshot.pearls },
        pearlsSnapshot,
      ),
      token,
    };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
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

    const requirePhoneVerificationOnLogin =
      (process.env.AUTH_REQUIRE_VERIFIED_PHONE_ON_LOGIN ?? 'false') === 'true';
    if (
      requirePhoneVerificationOnLogin &&
      !user.isTestAccount &&
      (!user.phone || !user.phoneVerifiedAt)
    ) {
      throw new UnauthorizedException('PHONE_NOT_VERIFIED');
    }

    const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return {
      user: this.toSafeUser(
        { ...user, pearls: pearlsSnapshot.pearls },
        pearlsSnapshot,
      ),
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');
    const pearlsSnapshot = await this.loadPearlsSnapshot(userId);
    return this.toSafeUser(
      { ...user, pearls: pearlsSnapshot.pearls },
      pearlsSnapshot,
    );
  }
}
