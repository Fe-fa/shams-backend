import { IsOptional, IsInt, IsDateString, IsEnum, Min } from 'class-validator';
import { AppointmentStatus, AppointmentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class FilterAppointmentDto {
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  patientId?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  doctorId?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @IsEnum(AppointmentType)
  @IsOptional()
  appointmentType?: AppointmentType;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}