import { IsInt, IsString, IsDateString, IsBoolean, IsOptional, IsNumber } from 'class-validator';

export class CreateQueueDto {
  @IsInt()
  patientId: number;

  @IsInt()
  @IsOptional()
  appointmentId?: number;

  @IsString()
  patientName: string;

  @IsString()
  department: string;

  @IsString()
  serviceType: string;

  @IsString()
  @IsOptional()
  doctorName?: string;

  @IsString()
  @IsOptional()
  priorityLevel?: string;

  @IsBoolean()
  @IsOptional()
  isEmergency?: boolean;
}