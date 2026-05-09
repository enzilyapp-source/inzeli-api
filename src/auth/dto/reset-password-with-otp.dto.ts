import { IsNotEmpty, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordWithOtpDto {
  @IsNotEmpty()
  requestId!: string;

  @IsNotEmpty()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
