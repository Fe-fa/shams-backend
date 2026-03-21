import { Injectable } from '@nestjs/common';
import { PriorityClassificationRequest, PriorityClassificationResponse } from '../dto';

@Injectable()
export class PriorityClassifierService {
  /**
   * Local fallback logic that matches the Python PriorityClassifier implementation.
   */
  async classify(request: PriorityClassificationRequest): Promise<PriorityClassificationResponse> {
    const urgencyKeywords = {
      EMERGENCY: ['chest pain', 'severe', 'bleeding', 'unconscious', 'accident', 'trauma', 'emergency'],
      HIGH: ['high fever', 'difficulty breathing', 'severe pain', 'infection', 'urgent'],
      MEDIUM: ['moderate pain', 'fever', 'cough', 'headache', 'follow-up'],
      LOW: ['checkup', 'routine', 'minor', 'consultation', 'preventive'],
    };

    // Use chief_complaint as the primary source of text, matching the Python service logic
    const text = `${request.chief_complaint || ''} ${request.symptoms || ''}`.toLowerCase();

    let priorityLevel = 'LOW';
    let priorityScore = 1.0;
    const reasoning: string[] = [];

    // 1. Check for emergency keywords
    for (const keyword of urgencyKeywords.EMERGENCY) {
      if (text.includes(keyword)) {
        priorityLevel = 'EMERGENCY';
        priorityScore = 4.0;
        reasoning.push(`Emergency keyword detected: ${keyword}`);
        break;
      }
    }

    // 2. Check for high priority if not emergency
    if (priorityLevel !== 'EMERGENCY') {
      for (const keyword of urgencyKeywords.HIGH) {
        if (text.includes(keyword)) {
          priorityLevel = 'HIGH';
          priorityScore = 3.0;
          reasoning.push(`High priority symptom: ${keyword}`);
          break;
        }
      }
    }

    // 3. Vulnerable Age factor - Corrected from patient_age to age
    if (request.age) {
      if (request.age < 5 || request.age > 65) {
        priorityScore += 0.5;
        reasoning.push('Patient in vulnerable age group');
      }
    }

    // 4. Vital signs factor - Using the Dict structure from Python
    if (request.vital_signs) {
      reasoning.push('Vital signs available for assessment');
      const temp = request.vital_signs.temperature;
      if (temp && (temp > 39.0 || temp < 35.0)) {
        priorityScore += 0.3;
      }
    }

    // 5. Medical history factor
    if (request.medical_history && request.medical_history.toLowerCase().includes('chronic')) {
      reasoning.push('Chronic condition history');
      priorityScore += 0.3;
    }

    // Determine Action based on level
    let recommendedAction = '';
    if (priorityLevel === 'EMERGENCY') {
      recommendedAction = 'Immediate medical attention required. Fast-track to emergency bay.';
    } else if (priorityLevel === 'HIGH') {
      recommendedAction = 'Priority appointment. Schedule within 24 hours.';
    } else {
      recommendedAction = 'Standard scheduling. Monitor for any changes.';
    }

    // Final Return matches PriorityClassificationResponse and Python ai.py
    return {
      // appointment_id: request.appointment_id,
      priority_level: priorityLevel.toLowerCase(),
      priority_score: Math.round(priorityScore * 100) / 100,
      reasoning: reasoning.length > 0 ? reasoning : [`Standard ${priorityLevel} assessment`],
      recommended_action: recommendedAction,
    };
  }
}