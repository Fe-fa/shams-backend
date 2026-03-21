import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private apiKey: string;
  private partnerId: string;
  private senderId: string;
  private apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TEXTSMS_API_KEY') || '';
    this.partnerId = this.configService.get<string>('TEXTSMS_PARTNER_ID') || '';
    this.senderId = this.configService.get<string>('TEXTSMS_SENDER_ID') || 'TextSMS';
    this.apiUrl = this.configService.get<string>('TEXTSMS_ENDPOINT') || '';
  }

  /**
   * Core method to send SMS via TextSMS API
   */
  async sendSms(to: string, message: string) {
    if (!this.apiKey || !this.partnerId) {
      console.error('❌ TextSMS credentials missing in .env');
      return;
    }

    // TextSMS prefers phone numbers without the '+' prefix
    const formattedPhone = to.replace('+', '');

    try {
      // Structure matches 'sendSMS POST' from your collection 
      const response = await axios.post(this.apiUrl, {
        apikey: this.apiKey,      
        partnerID: this.partnerId, 
        mobile: formattedPhone,               
        message: message,         
        shortcode: this.senderId, 
        pass_type: 'plain' // Required field per Postman source 
      });

      console.log(`✅ SMS sent to ${formattedPhone}:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`❌ TextSMS Error:`, error.response?.data || error.message);
      throw new InternalServerErrorException('SMS Delivery Failed');
    }
  }

  /**
   * MISSING METHOD: Added to resolve TS2339 error
   */
  async sendAppointmentReminder(phone: string, appointmentDetails: { doctorName: string; date: string; time: string }) {
    const message = `Reminder: You have an appointment with Dr. ${appointmentDetails.doctorName} on ${appointmentDetails.date} at ${appointmentDetails.time}.`;
    return await this.sendSms(phone, message);
  }
}