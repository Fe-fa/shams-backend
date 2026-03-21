import { Injectable } from '@nestjs/common';
import { WaitTimePredictionRequest, WaitTimePredictionResponse } from '../dto';

@Injectable()
export class WaitTimeEstimatorService {
  // Placeholder - Replace with your actual ML model
  async predict(request: WaitTimePredictionRequest): Promise<WaitTimePredictionResponse> {
    const queueLength = request.current_queue_length || 0;
    const baseWaitPerPatient = 20; // minutes

    // Time of day multiplier
    let timeMultiplier = 1.0;
    if (request.time_of_day === 'morning') {
      timeMultiplier = 0.9; // Morning appointments tend to be faster
    } else if (request.time_of_day === 'afternoon') {
      timeMultiplier = 1.1;
    } else if (request.time_of_day === 'evening') {
      timeMultiplier = 1.2;
    }

    // Day of week multiplier
    let dayMultiplier = 1.0;
    if (request.day_of_week === 'Monday' || request.day_of_week === 'Friday') {
      dayMultiplier = 1.15; // Busier on Mondays and Fridays
    }

    // Appointment type multiplier
    let typeMultiplier = 1.0;
    if (request.appointment_type === 'CONSULTATION') {
      typeMultiplier = 1.2;
    } else if (request.appointment_type === 'FOLLOW_UP') {
      typeMultiplier = 0.8;
    } else if (request.appointment_type === 'EMERGENCY') {
      typeMultiplier = 0.5; // Emergencies get priority
    }

    const estimatedWait = Math.round(
      queueLength * baseWaitPerPatient * timeMultiplier * dayMultiplier * typeMultiplier
    );

    const appointmentDate = new Date(request.appointment_date);
    const serviceStart = new Date(appointmentDate.getTime() + estimatedWait * 60000);

    return {
      estimated_wait_time: estimatedWait,
      queue_position: queueLength + 1,
      estimated_service_start: serviceStart.toISOString(),
      confidence_score: 0.78,
    };
  }
}