import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { NoShowPredictorService } from './services/noshow-predictor.service';
import { WaitTimeEstimatorService } from './services/waittime-estimator.service';
import { PriorityClassifierService } from './services/priority-classifier.service';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    AppointmentsModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    NoShowPredictorService,
    WaitTimeEstimatorService,
    PriorityClassifierService,
  ],
  exports: [AiService],
})
export class AiModule {}