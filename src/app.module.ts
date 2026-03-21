import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { QueueModule } from './modules/queue/queue.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MailModule } from './modules/mail/mail.module';
import { SmsModule } from './modules/sms/sms.module';
import { MpesaModule } from './modules/mpesa/mpesa.module';
import { ServicesModule } from './modules/services/services.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AppointmentsModule,
    QueueModule,
    NotificationsModule,
    AiModule,
    AnalyticsModule,
    MailModule,
    SmsModule,
    MpesaModule,
    ServicesModule,
    PaymentsModule,
  ],
})
export class AppModule {}