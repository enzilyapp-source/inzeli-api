import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestRegisterOtpDto } from './dto/request-register-otp.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { RequestPasswordResetOtpDto } from './dto/request-password-reset-otp.dto';
import { ResetPasswordWithOtpDto } from './dto/reset-password-with-otp.dto';
import { AuthGuard } from '@nestjs/passport';
import { ok, err } from '../common/api';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // New flow: request OTP with registration payload
  @Post('register/request-otp')
  async requestRegisterOtp(@Body() dto: RequestRegisterOtpDto) {
    try {
      return ok('OTP sent', await this.auth.requestRegisterOtp(dto));
    } catch (e: any) {
      const code = e?.response?.message || 'OTP_REQUEST_FAILED';
      return err(code, code);
    }
  }

  // New flow: verify OTP then create account
  @Post('register/verify-otp')
  async verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
    try {
      return ok('Account created 🎉', await this.auth.verifyRegisterOtp(dto));
    } catch (e: any) {
      const code = e?.response?.message || 'OTP_VERIFY_FAILED';
      return err(code, code);
    }
  }

  // Legacy alias for older clients: behaves like request-otp.
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      return ok('OTP sent', await this.auth.requestRegisterOtp(dto));
    } catch (e: any) {
      const code = e?.response?.message || 'REGISTRATION_FAILED';
      return err(code, code);
    }
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    try {
      return ok('Signed in ✅', await this.auth.login(dto));
    } catch (e: any) {
      const code = e?.response?.message || 'INVALID_CREDENTIALS';
      if (code === 'PHONE_NOT_VERIFIED') {
        return err('PHONE_NOT_VERIFIED', 'PHONE_NOT_VERIFIED');
      }
      return err('INVALID_CREDENTIALS', 'INVALID_CREDENTIALS');
    }
  }

  @Post('password/request-otp')
  async requestPasswordResetOtp(@Body() dto: RequestPasswordResetOtpDto) {
    try {
      return ok(
        'Password reset OTP sent',
        await this.auth.requestPasswordResetOtp(dto),
      );
    } catch (e: any) {
      const code = e?.response?.message || 'PASSWORD_RESET_REQUEST_FAILED';
      return err(code, code);
    }
  }

  @Post('password/reset')
  async resetPasswordWithOtp(@Body() dto: ResetPasswordWithOtpDto) {
    try {
      return ok('Password reset', await this.auth.resetPasswordWithOtp(dto));
    } catch (e: any) {
      const code = e?.response?.message || 'PASSWORD_RESET_FAILED';
      return err(code, code);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('refresh')
  async refresh(@Req() req: any) {
    return ok(
      'Session refreshed',
      await this.auth.refreshSession(req.user.userId),
    );
  }

  @Post('otp/status')
  async otpDeliveryStatus(@Body() body: any, @Query('secret') secret?: string) {
    try {
      return ok(
        'OTP delivery status received',
        await this.auth.handleOtpDeliveryStatus(body, secret),
      );
    } catch (e: any) {
      const code = e?.response?.message || 'OTP_STATUS_CALLBACK_FAILED';
      return err(code, code);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: any) {
    return ok('Profile', await this.auth.getProfile(req.user.userId));
  }
}
//auth/auth.controller.ts
