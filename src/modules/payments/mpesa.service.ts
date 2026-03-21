import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface StkPushInput {
  amount: number;
  phoneNumber: string;
  accountReference: string;
  transactionDesc: string;
}

interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  private cachedAccessToken: string | null = null;
  private cachedAccessTokenExpiry = 0;

  constructor(private readonly configService: ConfigService) {}

  private getBaseUrl(): string {
    const customBaseUrl = this.configService.get<string>('MPESA_BASE_URL');
    if (customBaseUrl) return customBaseUrl.replace(/\/+$/, '');

    const env = (
      this.configService.get<string>('MPESA_ENV', 'sandbox') || 'sandbox'
    ).toLowerCase();
    return env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  private getShortCode(): string {
    const shortCode = this.configService.get<string>('MPESA_SHORTCODE');
    if (!shortCode) {
      throw new InternalServerErrorException(
        'MPESA_SHORTCODE is not configured',
      );
    }
    return shortCode;
  }

  private getPasskey(): string {
    const passkey = this.configService.get<string>('MPESA_PASSKEY');
    if (!passkey) {
      throw new InternalServerErrorException('MPESA_PASSKEY is not configured');
    }
    return passkey;
  }

  private getCallbackUrl(): string {
    const callbackUrl = this.configService.get<string>('MPESA_CALLBACK_URL');
    if (!callbackUrl) {
      throw new InternalServerErrorException(
        'MPESA_CALLBACK_URL is not configured',
      );
    }
    return callbackUrl;
  }

  private getTransactionType(): string {
    return this.configService.get<string>(
      'MPESA_TRANSACTION_TYPE',
      'CustomerPayBillOnline',
    );
  }

  normalizePhoneNumber(phone: string): string {
    if (!phone?.trim()) {
      throw new BadRequestException(
        'Phone number is required for M-Pesa payments',
      );
    }

    let normalized = phone.replace(/\D/g, '');

    if (normalized.startsWith('0')) {
      normalized = `254${normalized.slice(1)}`;
    } else if (normalized.startsWith('7') && normalized.length === 9) {
      normalized = `254${normalized}`;
    } else if (normalized.startsWith('1') && normalized.length === 9) {
      normalized = `254${normalized}`;
    }

    if (!/^254(7|1)\d{8}$/.test(normalized)) {
      throw new BadRequestException(
        'Invalid M-Pesa phone number. Use 07..., 01..., 2547..., 2541..., or +254...',
      );
    }

    return normalized;
  }

  private generateTimestamp(): string {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mi = `${date.getMinutes()}`.padStart(2, '0');
    const ss = `${date.getSeconds()}`.padStart(2, '0');

    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
  }

  private generatePassword(timestamp: string): string {
    const shortCode = this.getShortCode();
    const passkey = this.getPasskey();
    return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
  }

  async getAccessToken(): Promise<string> {
    if (
      this.cachedAccessToken &&
      this.cachedAccessTokenExpiry > Date.now() + 60_000
    ) {
      return this.cachedAccessToken;
    }

    const consumerKey = this.configService
      .get<string>('MPESA_CONSUMER_KEY')
      ?.trim();
    const consumerSecret = this.configService
      .get<string>('MPESA_CONSUMER_SECRET')
      ?.trim();

    if (!consumerKey || !consumerSecret) {
      throw new InternalServerErrorException(
        'MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET is missing',
      );
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
      'base64',
    );
    const url = `${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
    } catch (networkError: any) {
      this.logger.error(
        `M-Pesa token request network failure: ${networkError?.message || networkError}`,
      );
      throw new InternalServerErrorException(
        `Network error while connecting to M-Pesa: ${networkError?.message || 'Unknown network error'}`,
      );
    }

    const rawText = await response.text();

    if (!response.ok) {
      this.logger.error(
        [
          'Failed to get M-Pesa token',
          `URL: ${url}`,
          `Status: ${response.status} ${response.statusText}`,
          `Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`,
          `Body: ${rawText || '<empty>'}`,
        ].join(' | '),
      );

      throw new InternalServerErrorException(
        `Failed to authenticate with M-Pesa (${response.status} ${response.statusText})`,
      );
    }

    let data: { access_token?: string; expires_in?: string | number };

    try {
      data = JSON.parse(rawText);
    } catch {
      this.logger.error(
        `Invalid JSON from M-Pesa token endpoint: ${rawText || '<empty>'}`,
      );
      throw new InternalServerErrorException(
        'Invalid response from M-Pesa token endpoint',
      );
    }

    if (!data?.access_token) {
      this.logger.error(
        `M-Pesa token missing in response: ${rawText || '<empty>'}`,
      );
      throw new InternalServerErrorException(
        'M-Pesa token response did not include access_token',
      );
    }

    this.cachedAccessToken = data.access_token;
    this.cachedAccessTokenExpiry =
      Date.now() + (Number(data.expires_in ?? 3599) - 60) * 1000;

    return data.access_token;
  }

  async initiateStkPush(input: StkPushInput): Promise<StkPushResponse> {
    const phoneNumber = this.normalizePhoneNumber(input.phoneNumber);
    const amount = Math.round(Number(input.amount));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    const token = await this.getAccessToken();
    const timestamp = this.generateTimestamp();

    const payload = {
      BusinessShortCode: this.getShortCode(),
      Password: this.generatePassword(timestamp),
      Timestamp: timestamp,
      TransactionType: this.getTransactionType(),
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: this.getShortCode(),
      PhoneNumber: phoneNumber,
      CallBackURL: this.getCallbackUrl(),
      AccountReference: input.accountReference,
      TransactionDesc: input.transactionDesc,
    };

    const response = await fetch(
      `${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`STK push failed: ${JSON.stringify(data)}`);
      throw new BadRequestException(
        data?.errorMessage ||
          data?.ResponseDescription ||
          'Failed to initiate STK push',
      );
    }

    if (data?.ResponseCode !== '0') {
      throw new BadRequestException(
        data?.ResponseDescription ||
          data?.CustomerMessage ||
          'STK push was rejected',
      );
    }

    return data as StkPushResponse;
  }

  async queryStkPush(checkoutRequestId: string) {
    const token = await this.getAccessToken();
    const timestamp = this.generateTimestamp();

    const payload = {
      BusinessShortCode: this.getShortCode(),
      Password: this.generatePassword(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await fetch(
      `${this.getBaseUrl()}/mpesa/stkpushquery/v1/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`STK query failed: ${JSON.stringify(data)}`);
      throw new BadRequestException(
        data?.errorMessage ||
          data?.ResponseDescription ||
          'Failed to query STK status',
      );
    }

    return data;
  }
}
