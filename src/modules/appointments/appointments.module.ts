import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MailModule, SmsModule, NotificationsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}