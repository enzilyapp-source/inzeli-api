// src/rooms/dto/create-room.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsNumber } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsOptional()
  @IsString()
  sponsorCode?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsNumber()
  radiusMeters?: number;
}
