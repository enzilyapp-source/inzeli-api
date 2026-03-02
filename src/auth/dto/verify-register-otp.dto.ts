import { IsNotEmpty, Matches } from 'class-validator';

export class VerifyRegisterOtpDto {
  @IsNotEmpty()
  requestId!: string;

  @IsNotEmpty()
  @Matches(/^\d{6}$/)
  code!: string;
}
