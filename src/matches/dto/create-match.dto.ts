import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  gameId: string;

  @IsArray()
  winners: string[];

  @IsArray()
  losers: string[];

  @IsOptional()
  @IsString()
  roomCode?: string;

  @IsOptional()
  @IsString()
  sponsorCode?: string;

  // ✅ stakeUnits removed بالكامل (عشان ما يصير mismatch مع Flutter)
}
//src/dto/create-match.dto.ts