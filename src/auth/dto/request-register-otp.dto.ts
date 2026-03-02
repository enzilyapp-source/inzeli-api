import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestRegisterOtpDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @MaxLength(40)
  displayName!: string;

  @IsNotEmpty()
  @Matches(/^[0-9+][0-9\s-]{7,20}$/)
  phone!: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;
}
