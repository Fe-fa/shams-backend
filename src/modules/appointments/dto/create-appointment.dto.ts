import {
  IsInt,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AppointmentType, PriorityLevel } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  doctorId?: number;

  @IsDateString()
  appointmentDate: string;

  @IsEnum(AppointmentType)
  appointmentType: AppointmentType;

  @IsEnum(PriorityLevel)
  @IsOptional()
  priority?: PriorityLevel;

  @IsInt()
  @Min(15)
  @IsOptional()
  @Type(() => Number)
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  symptoms?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
