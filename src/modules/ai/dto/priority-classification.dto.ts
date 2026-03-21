import { IsInt, IsOptional, IsString, IsNumber, IsObject } from 'class-validator';

export class PriorityClassificationRequest {
  @IsInt()
  patient_id: number;

  @IsInt()
  @IsOptional()
  appointment_id?: number;

  @IsString()
  chief_complaint: string;

  @IsString()
  @IsOptional()
  symptoms?: string;

  /**
   * CHANGED: Python uses .get() on this, so it MUST be an object.
   * Sending a string will cause a 500 error in the Python logic.
   */
  @IsObject()
  @IsOptional()
  vital_signs?: {
    temperature?: number;
    bp_systolic?: number;
    bp_diastolic?: number;
    heart_rate?: number;
    spo2?: number;
  };

  @IsString()
  @IsOptional()
  medical_history?: string;

  /**
   * CHANGED: Python logic explicitly calls 'request.age'.
   * Using 'patient_age' here will trigger a 422 (Missing Field) in Python.
   */
  @IsNumber()
  @IsOptional()
  age?: number;

  /**
   * ADDED: Required for the Python 'appointment_type_map' lookup.
   */
  @IsString()
  @IsOptional()
  appointment_type?: string;
}

export class PriorityClassificationResponse {
  priority_level: string;
  priority_score: number;
  
  /**
   * CHANGED: Python returns 'reasoning' (List[str]).
   */
  reasoning: string[];
  
  /**
   * CHANGED: Python returns 'recommended_action'.
   */
  recommended_action: string;
}