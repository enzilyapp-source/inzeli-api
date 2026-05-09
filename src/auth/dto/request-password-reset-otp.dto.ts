import { IsEmail } from 'class-validator';

export class RequestPasswordResetOtpDto {
  @IsEmail()
  email!: string;
}
