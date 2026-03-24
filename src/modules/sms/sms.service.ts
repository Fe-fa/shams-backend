import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private readonly apiKey: string;
  private readonly partnerId: string;
  private readonly senderId: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TEXTSMS_API_KEY') || '';
    this.partnerId =
      this.configService.get<string>('TEXTSMS_PARTNER_ID') || '';
    this.senderId =
      this.configService.get<string>('TEXTSMS_SENDER_ID') || 'TextSMS';
    this.apiUrl = this.configService.get<string>('TEXTSMS_ENDPOINT') || '';
  }

  private formatPhoneNumber(phone: string): string {
    return phone.replace(/\+/g, '').trim();
  }

  /**
   * Core method to send SMS via TextSMS API
   */
  async sendSms(to: string, message: string) {
    if (!this.apiKey || !this.partnerId || !this.apiUrl) {
      this.logger.error(
        'TextSMS credentials or endpoint missing in environment variables',
      );
      throw new InternalServerErrorException(
        'SMS service is not configured properly',
      );
    }

    const formattedPhone = this.formatPhoneNumber(to);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          apikey: this.apiKey,
          partnerID: this.partnerId,
          mobile: formattedPhone,
          message,
          shortcode: this.senderId,
          pass_type: 'plain',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`SMS sent successfully to ${formattedPhone}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `TextSMS Error: ${JSON.stringify(
          error.response?.data || error.message,
        )}`,
      );
      throw new InternalServerErrorException('SMS Delivery Failed');
    }
  }

  /**
   * Send registration / resend verification code by SMS
   */
  async sendVerificationCode(
    phone: string,
    code: string,
    firstName?: string,
  ) {
    const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
    const message = `${greeting} your verification code is ${code}. It expires in 15 minutes.`;

    return this.sendSms(phone, message);
  }

  /**
   * Send verification code when admin/doctor creates account
   */
  async sendInviteVerificationCode(
    phone: string,
    details: { firstName?: string; code: string; role: string },
  ) {
    const greeting = details.firstName ? `Hello ${details.firstName},` : 'Hello,';
    const message = `${greeting} your ${details.role} account has been created. Your verification code is ${details.code}. Please check your email for your temporary password.`;

    return this.sendSms(phone, message);
  }

  /**
   * Appointment reminder SMS
   */
  async sendAppointmentReminder(
    phone: string,
    appointmentDetails: { doctorName: string; date: string; time: string },
  ) {
    const message = `Reminder: You have an appointment with Dr. ${appointmentDetails.doctorName} on ${appointmentDetails.date} at ${appointmentDetails.time}.`;

    return this.sendSms(phone, message);
  }
}
