import { IsEnum, IsOptional, IsDateString, IsInt, IsString } from 'class-validator';
import { QueueStatus } from '@prisma/client';

export class UpdateQueueDto {
  @IsEnum(QueueStatus)
  @IsOptional()
  status?: QueueStatus;

  @IsDateString()
  @IsOptional()
  calledTime?: string;

  @IsDateString()
  @IsOptional()
  serviceStartTime?: string;

  @IsDateString()
  @IsOptional()
  serviceEndTime?: string;

  @IsInt()
  @IsOptional()
  estimatedWaitTime?: number;

  @IsString()
  @IsOptional()
  roomNumber?: string;
}