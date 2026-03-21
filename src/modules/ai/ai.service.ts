import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, catchError, of } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { NoShowPredictorService } from './services/noshow-predictor.service';
import { WaitTimeEstimatorService } from './services/waittime-estimator.service';
import { PriorityClassifierService } from './services/priority-classifier.service';
import {
  NoShowPredictionRequest,
  WaitTimePredictionRequest,
  PriorityClassificationRequest,
  QueueOptimizationRequest,
  BatchPredictionRequest,
} from './dto';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly mlBaseUrl: string;
  private readonly mlApiKey: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService,
    private noShowPredictor: NoShowPredictorService,
    private waitTimeEstimator: WaitTimeEstimatorService,
    private priorityClassifier: PriorityClassifierService,
  ) {
    this.mlBaseUrl = this.configService.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8000',
    );

    // ✅ Read once, fail loudly if missing
    this.mlApiKey = this.configService.get<string>('ML_SERVICE_API_KEY') ?? '';
  }

  // ── Lifecycle hook: validate config at startup ────────────────────────────
  onModuleInit() {
    if (!this.mlApiKey) {
      this.logger.error(
        '❌  ML_SERVICE_API_KEY is not set in environment variables!\n' +
          '    All calls to the Python ML service will receive 401 Unauthorized.\n' +
          '    Add ML_SERVICE_API_KEY=<value> to your .env and restart.',
      );
    } else {
      this.logger.log(`✅  ML Service configured → ${this.mlBaseUrl}`);
    }
  }

  // ── Private: call Python FastAPI ─────────────────────────────────────────
  private async callPythonML<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T | null> {
    // Guard: never send an empty/undefined key — it will always 401
    if (!this.mlApiKey) {
      this.logger.warn(
        `Skipping ML call (${endpoint}): ML_SERVICE_API_KEY not configured.`,
      );
      return null;
    }

    const url = `${this.mlBaseUrl}/api/v1${endpoint}`;
    const apiKey = this.configService.get<string>('ML_SERVICE_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<T>(url, payload, {
            headers: {
              'X-Internal-API-Key': this.mlApiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10_000, // 10 s — don't hang forever
          })
          .pipe(
            catchError((err) => {
              const httpStatus: number | undefined = err?.response?.status;

              // ── Auth failure ─────────────────────────────────────────────
              if (httpStatus === 401 || httpStatus === 403) {
                const body = JSON.stringify(err?.response?.data ?? {});
                throw new Error(
                  `ML service auth rejected (${httpStatus}) at ${endpoint}. ` +
                    `Response: ${body}. ` +
                    `Check that ML_SERVICE_API_KEY matches INTERNAL_API_KEY in Python.`,
                );
              }

              // ── Service down / 5xx / timeout → safe to fall back ─────────
              this.logger.warn(
                `ML service unavailable (${endpoint}): ` +
                  `[${httpStatus ?? 'network error'}] ${err.message}`,
              );
              return of(null as any);
            }),
          ),
      );

      return response?.data ?? null;
    } catch (err) {
      const message = (err as Error).message ?? String(err);

      if (message.includes('auth rejected')) {
        // Re-throw auth failures so the controller can surface them clearly
        this.logger.error(message);
        throw err;
      }

      this.logger.warn(`ML call failed (${endpoint}): ${message}`);
      return null;
    }
  }

  // ── No-show prediction ────────────────────────────────────────────────────
  async predictNoShow(request: NoShowPredictionRequest, _userId?: number) {
    // Enrich from DB when appointment_id is provided
    if (request.appointment_id) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: request.appointment_id },
        include: { patient: true },
      });

      if (appt) {
        request.patient_id = appt.patientId;
        request.appointment_date = appt.appointmentDate.toISOString();
        request.appointment_type = appt.appointmentType as string;

        const [prevTotal, prevNoShow] = await Promise.all([
          this.prisma.appointment.count({
            where: { patientId: appt.patientId },
          }),
          this.prisma.appointment.count({
            where: { patientId: appt.patientId, status: 'NO_SHOW' },
          }),
        ]);

        request.previous_appointments = prevTotal;
        request.previous_no_shows = prevNoShow;
      }
    }

    // 1️⃣  Try Python ML service first
    const mlResult = await this.callPythonML<any>(
      '/ai/predict-noshow',
      request,
    );
    // 2️⃣  Fall back to local TypeScript predictor
    const prediction =
      mlResult ?? (await this.noShowPredictor.predict(request));

    // Persist result
    if (
      request.appointment_id &&
      prediction?.no_show_probability !== undefined
    ) {
      await this.prisma.appointment
        .update({
          where: { id: request.appointment_id },
          data: { noShowProbability: prediction.no_show_probability },
        })
        .catch((e) =>
          this.logger.warn(
            `Failed to persist no-show probability: ${e.message}`,
          ),
        );
    }

    return prediction;
  }

  // ── Wait-time estimation ──────────────────────────────────────────────────
  async estimateWaitTime(request: WaitTimePredictionRequest) {
    if (!request.current_queue_length) {
      const appointmentDate = new Date(request.appointment_date);
      request.current_queue_length = await this.prisma.appointment.count({
        where: {
          doctorId: request.doctor_id,
          appointmentDate: {
            gte: new Date(new Date(appointmentDate).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(appointmentDate).setHours(23, 59, 59, 999)),
          },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        },
      });
    }

    if (!request.time_of_day) {
      const h = new Date(request.appointment_date).getHours();
      request.time_of_day =
        h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    }
    if (!request.day_of_week) {
      request.day_of_week = new Date(
        request.appointment_date,
      ).toLocaleDateString('en-US', { weekday: 'long' });
    }

    const mlResult = await this.callPythonML<any>(
      '/ai/estimate-wait-time',
      request,
    );
    const estimation =
      mlResult ?? (await this.waitTimeEstimator.predict(request));

    if (
      request.appointment_id &&
      estimation?.estimated_wait_time !== undefined
    ) {
      await this.prisma.appointment
        .update({
          where: { id: request.appointment_id },
          data: {
            estimatedWaitTime: estimation.estimated_wait_time,
            queuePosition: estimation.queue_position,
          },
        })
        .catch((e) =>
          this.logger.warn(`Failed to persist wait time: ${e.message}`),
        );
    }

    return estimation;
  }

  // ── Priority classification ───────────────────────────────────────────────
  async classifyPriority(request: PriorityClassificationRequest) {
    const payload = {
    appointment_id: request.appointment_id || null,
    patient_id: (request as any).patient_id || 0, // Mandatory in Python
    chief_complaint: (request as any).chief_complaint || 'No complaint provided', // Mandatory in Python
    symptoms: request.symptoms || '',
    age: Number(request.age) || 30, // Force to number/int
    vital_signs: request.vital_signs || {}, // Ensure it's an object, not null
    medical_history: (request as any).medical_history || '',
    appointment_type: request.appointment_type || 'consultation',
  };
    const mlResult = await this.callPythonML<any>(
      '/ai/classify-priority',
      payload,
    );
    const classification =
      mlResult ?? (await this.priorityClassifier.classify(request));

    if (
      request.appointment_id &&
      classification?.priority_score !== undefined
    ) {
      await this.prisma.appointment
        .update({
          where: { id: request.appointment_id },
          data: {
            aiPriorityScore: classification.priority_score,
            priority: classification.priority_level?.toUpperCase() as any,
          },
        })
        .catch((e) =>
          this.logger.warn(`Failed to persist priority: ${e.message}`),
        );
    }

    return classification;
  }

  // ── Queue optimisation ────────────────────────────────────────────────────
  async optimizeQueue(request: QueueOptimizationRequest) {
    const mlResult = await this.callPythonML<any>(
      '/ai/optimize-queue',
      request,
    );
    if (mlResult) return mlResult;

    // ── Local fallback ────────────────────────────────────────────────────
    const date = new Date(request.date);
    const where: any = {
      appointmentDate: {
        gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
      },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    };
    if (request.doctor_id) where.doctorId = request.doctor_id;

    const appointments = await this.prisma.appointment.findMany({ where });

    const weights: Record<string, number> = {
      EMERGENCY: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    const scored = appointments
      .map((apt) => ({
        appointment_id: apt.id,
        patient_id: apt.patientId,
        priority_score:
          (weights[apt.priority] ?? 2) +
          (apt.noShowProbability ? (1 - apt.noShowProbability) * 0.5 : 0),
        priority_level: apt.priority,
        no_show_probability: apt.noShowProbability,
        appointment_time: apt.appointmentDate.toISOString(),
        original_position: apt.queuePosition ?? 0,
        new_position: 0,
      }))
      .sort((a, b) => b.priority_score - a.priority_score);

    let changes = 0;
    for (let i = 0; i < scored.length; i++) {
      scored[i].new_position = i + 1;
      if (scored[i].original_position !== i + 1) {
        changes++;
        await this.prisma.appointment
          .update({
            where: { id: scored[i].appointment_id },
            data: { queuePosition: i + 1 },
          })
          .catch(() => {});
      }
    }

    const totalMin = appointments.reduce(
      (s, a) => s + (a.durationMinutes ?? 30),
      0,
    );

    return {
      optimized_queue: scored,
      total_appointments: scored.length,
      estimated_completion_time: new Date(
        Date.now() + totalMin * 60_000,
      ).toISOString(),
      efficiency_score: scored.length > 0 ? 1 - changes / scored.length : 0,
      changes_made: changes,
    };
  }

  // ── Batch prediction ──────────────────────────────────────────────────────
  async batchPredict(request: BatchPredictionRequest) {
    const mlResult = await this.callPythonML<any>('/ai/batch-predict', request);
    if (mlResult) return mlResult;

    const predictions: any[] = [];
    const failed: number[] = [];

    for (const aptId of request.appointment_ids) {
      try {
        const apt = await this.prisma.appointment.findUnique({
          where: { id: aptId },
        });
        if (!apt) {
          failed.push(aptId);
          continue;
        }

        if (request.prediction_type === 'no_show') {
          const r = await this.predictNoShow({
            appointment_id: aptId,
            patient_id: apt.patientId,
            appointment_date: apt.appointmentDate.toISOString(),
            appointment_type: apt.appointmentType as string,
          });
          predictions.push({
            appointment_id: aptId,
            type: 'no_show',
            result: r,
          });
        } else if (request.prediction_type === 'wait_time') {
          if (apt.doctorId === null) {
            failed.push(aptId);
            continue;
          }
          const r = await this.estimateWaitTime({
            appointment_id: aptId,
            doctor_id: apt.doctorId,
            appointment_date: apt.appointmentDate.toISOString(),
            appointment_type: apt.appointmentType as string,
          });
          predictions.push({
            appointment_id: aptId,
            type: 'wait_time',
            result: r,
          });
        } else {
          failed.push(aptId);
        }
      } catch {
        failed.push(aptId);
      }
    }

    return {
      predictions,
      total_processed: predictions.length,
      failed_predictions: failed,
    };
  }

  // ── Health check ──────────────────────────────────────────────────────────
  async healthCheck() {
    let mlServiceOnline = false;

    try {
      const res = await firstValueFrom(
        this.httpService
          .get(`${this.mlBaseUrl}/health`) // ← public endpoint, no auth needed
          .pipe(catchError(() => of(null))),
      );
      mlServiceOnline = res?.status === 200;
    } catch {
      /* service offline — that's fine */
    }

    return {
      no_show_predictor: true,
      wait_time_estimator: true,
      priority_classifier: true,
      ml_service_online: mlServiceOnline,
      ml_service_url: this.mlBaseUrl,
      api_key_configured: !!this.mlApiKey, // ✅ helpful debug field
      status: 'healthy',
    };
  }
}
