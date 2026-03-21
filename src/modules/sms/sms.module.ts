import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { SmsService } from './sms.service';

@Module({
  imports: [ConfigModule], // Allows SmsService to use ConfigService
  providers: [SmsService],
  exports: [SmsService], // Exported so other modules can send SMS
})
export class SmsModule {}