import { Min, Max } from 'class-validator';
// src/rooms/dto/join-room.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { IsOptional, IsNumber } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

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
}
