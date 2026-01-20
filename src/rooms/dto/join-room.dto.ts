// src/rooms/dto/join-room.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { IsOptional, IsNumber } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}
