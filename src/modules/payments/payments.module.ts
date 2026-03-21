import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { MpesaController } from './mpesa.controller';
import { PaymentsService } from './payments.service';
import { MpesaService } from './mpesa.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [PaymentsController, MpesaController],
  providers: [PaymentsService, MpesaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}