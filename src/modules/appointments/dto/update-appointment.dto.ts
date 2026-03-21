import {
  IsInt,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
} from 'class-validator';
import {
  AppointmentStatus,
  AppointmentType,
  PriorityLevel,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateAppointmentDto {
  // ── Assignment
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  doctorId?: number;

  // ── Scheduling
  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @IsEnum(AppointmentType)
  @IsOptional()
  appointmentType?: AppointmentType;

  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @IsEnum(PriorityLevel)
  @IsOptional()
  priority?: PriorityLevel;

  @IsInt()
  @Min(15)
  @IsOptional()
  @Type(() => Number)
  durationMinutes?: number;

  // ── Clinical ──
  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  symptoms?: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsString()
  @IsOptional()
  prescription?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // ── Check-in ──
  @IsBoolean()
  @IsOptional()
  checkedIn?: boolean;
}
