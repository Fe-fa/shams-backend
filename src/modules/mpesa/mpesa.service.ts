import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { MpesaGateway } from './mpesa.gateway';
import { StkPushDto } from './dto/stk-push.dto';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  // Define environment variables as class properties for cleaner access
  private readonly shortCode = process.env.MPESA_SHORTCODE!;
  private readonly passKey = process.env.MPESA_PASSKEY!;
  private readonly consumerKey = process.env.MPESA_CONSUMER_KEY!;
  private readonly consumerSecret = process.env.MPESA_CONSUMER_SECRET!;
  private readonly callbackUrl = process.env.MPESA_CALLBACK_URL!;

  constructor(private readonly mpesaGateway: MpesaGateway) {
    // Basic runtime check to ensure your .env is actually loaded
    if (!this.shortCode || !this.passKey) {
      this.logger.error('M-Pesa environment variables are missing! Check your .env file.');
    }
  }

  /**
   * Generates the OAuth2 Access Token from Safaricom
   */
  private async getAccessToken(): Promise<string> {
    const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      return response.data.access_token;
    } catch (error) {
      this.logger.error('Failed to get M-Pesa access token', error.response?.data);
      throw new HttpException('M-Pesa Auth Failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Triggers the STK Push
   */
  async initiateStkPush(dto: StkPushDto) {
    const token = await this.getAccessToken();
    const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    
    // Fixed TS18048 by using class properties with non-null assertions
    const password = Buffer.from(
      this.shortCode + this.passKey + timestamp,
    ).toString('base64');

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(dto.amount),
      PartyA: dto.phoneNumber,
      PartyB: this.shortCode,
      PhoneNumber: dto.phoneNumber,
      CallBackURL: this.callbackUrl,
      AccountReference: dto.accountReference,
      TransactionDesc: 'Appointment Payment',
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      this.logger.error('STK Push Error', error.response?.data);
      throw new HttpException(
        error.response?.data?.CustomerMessage || 'STK Push Failed', 
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Fallback status query
   */
  async queryStatus(checkoutRequestId: string) {
    const token = await this.getAccessToken();
    const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query';
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(
      this.shortCode + this.passKey + timestamp,
    ).toString('base64');

    try {
      const response = await axios.post(url, {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      return error.response?.data;
    }
  }

  /**
   * Handles the Callback from Safaricom
   */
  async handleCallback(data: any) {
    const result = data.Body?.stkCallback;
    if (!result) return { ResultCode: 1, ResultDesc: 'Invalid Data' };

    const checkoutRequestId = result.CheckoutRequestID;
    const resultCode = result.ResultCode;

    this.logger.log(`Callback: ${checkoutRequestId} - ${result.ResultDesc}`);

    if (resultCode === 0) {
      const metadata = result.CallbackMetadata?.Item;
      const receipt = metadata?.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;

      this.mpesaGateway.emitPaymentStatus(checkoutRequestId, {
        success: true,
        message: 'Payment verified successfully',
        receipt: receipt,
      });
    } else {
      this.mpesaGateway.emitPaymentStatus(checkoutRequestId, {
        success: false,
        message: result.ResultDesc,
      });
    }
    return { ResultCode: 0, ResultDesc: 'Success' };
  }
}