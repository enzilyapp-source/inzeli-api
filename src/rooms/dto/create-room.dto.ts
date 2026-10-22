import { Min, Max } from 'class-validator';
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
  @IsString()
  dewanyahId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  radiusMeters?: number;
}
