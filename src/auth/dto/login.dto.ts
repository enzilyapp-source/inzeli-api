import { IsEmail, IsNotEmpty } from 'class-validator';
export class LoginDto {
  @IsEmail() email!: string;
  @IsNotEmpty() password!: string;
}
//auth/dto/login.dto.ts