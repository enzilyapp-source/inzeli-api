import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsISO8601 } from 'class-validator';
export class RegisterDto {
  @IsEmail() email!: string;
  @IsNotEmpty() @MinLength(6) password!: string;
  @IsNotEmpty() displayName!: string;
  @IsOptional() @IsISO8601() birthDate?: string;
}
//scr/auth/dto/register.dto.ts
