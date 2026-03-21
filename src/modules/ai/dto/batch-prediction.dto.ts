import { IsInt, IsString } from "class-validator";

export class BatchPredictionRequest {
  @IsInt({ each: true })
  appointment_ids: number[];

  @IsString()
  prediction_type: string;
}

export class BatchPredictionResponse {
  predictions: any[];
  total_processed: number;
  failed_predictions: number[];
}