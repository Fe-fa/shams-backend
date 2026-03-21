import { Injectable } from '@nestjs/common';
import { NoShowPredictionRequest, NoShowPredictionResponse } from '../dto/noshow-prediction.dto';

@Injectable()
export class NoShowPredictorService {
  // Placeholder - Replace with your actual ML model
  async predict(request: NoShowPredictionRequest): Promise<NoShowPredictionResponse> {
    // Simulate ML prediction logic
    const previousNoShowRate = request.previous_appointments && request.previous_appointments > 0
      ? (request.previous_no_shows || 0) / request.previous_appointments
      : 0;

    const baseProb = previousNoShowRate * 0.7;
    const typeMultiplier = request.appointment_type === 'EMERGENCY' ? 0.2 : 1.0;
    const weatherMultiplier = request.weather_condition === 'bad' ? 1.2 : 1.0;

    let probability = Math.min(baseProb * typeMultiplier * weatherMultiplier + Math.random() * 0.2, 1.0);

    let riskLevel = 'LOW';
    let recommendation = 'Patient has good attendance history';

    if (probability > 0.7) {
      riskLevel = 'HIGH';
      recommendation = 'Consider sending multiple reminders and follow-up calls';
    } else if (probability > 0.4) {
      riskLevel = 'MEDIUM';
      recommendation = 'Send reminder notifications 24 hours before appointment';
    }

    return {
      no_show_probability: Math.round(probability * 100) / 100,
      risk_level: riskLevel,
      confidence_score: 0.85,
      recommendation,
    };
  }
}