import { IsInt, IsDateString, IsString, IsOptional, IsNumber } from 'class-validator';

export class NoShowPredictionRequest {
  @IsInt()
  @IsOptional()
  appointment_id?: number;

  @IsInt()
  patient_id: number;

  @IsDateString()
  appointment_date: string;

  @IsString()
  appointment_type: string;

  @IsInt()
  @IsOptional()
  previous_no_shows?: number;

  @IsInt()
  @IsOptional()
  previous_appointments?: number;

  @IsNumber()
  @IsOptional()
  patient_age?: number;

  @IsString()
  @IsOptional()
  weather_condition?: string;
}

export class NoShowPredictionResponse {
  no_show_probability: number;
  risk_level: string;
  confidence_score: number;
  recommendation: string;
}