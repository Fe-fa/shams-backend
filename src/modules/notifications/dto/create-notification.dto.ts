import { IsInt, IsString, IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsInt()
  userId: number;

  @IsInt()
  @IsOptional()
  appointmentId?: number;

  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  recipientEmail?: string;

  @IsString()
  @IsOptional()
  recipientPhone?: string;
}