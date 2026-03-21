import { IsInt, IsOptional, IsDateString, IsString } from "class-validator";

export class WaitTimePredictionRequest {
  @IsInt()
  @IsOptional()
  appointment_id?: number;

  @IsInt()
  doctor_id: number;

  @IsDateString()
  appointment_date: string;

  @IsString()
  appointment_type: string;

  @IsInt()
  @IsOptional()
  current_queue_length?: number;

  @IsString()
  @IsOptional()
  time_of_day?: string;

  @IsString()
  @IsOptional()
  day_of_week?: string;
}

export class WaitTimePredictionResponse {
  estimated_wait_time: number;
  queue_position: number;
  estimated_service_start: string;
  confidence_score: number;
}