import { IsDateString, IsInt, IsOptional } from "class-validator";

export class QueueOptimizationRequest {
  @IsDateString()
  date: string;

  @IsInt()
  @IsOptional()
  doctor_id?: number;
}

export class QueueOptimizationResponse {
  optimized_queue: any[];
  total_appointments: number;
  estimated_completion_time: string;
  efficiency_score: number;
  changes_made: number;
}