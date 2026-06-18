import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class RequestPasswordResetOtpDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['sms', 'call', 'email'])
  channel?: 'sms' | 'call' | 'email';
}
