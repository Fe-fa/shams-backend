import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  Query, 
  HttpCode, 
  HttpStatus, 
  Logger 
} from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { StkPushDto } from './dto/stk-push.dto';

@Controller('mpesa')
export class MpesaController {
  private readonly logger = new Logger(MpesaController.name);

  constructor(private readonly mpesaService: MpesaService) {}

  @Post('stkpush')
  async initiateStkPush(@Body() dto: StkPushDto) {
    this.logger.log(`Initiating STK Push for: ${dto.phoneNumber}`);
    const data = await this.mpesaService.initiateStkPush(dto);
    
    return {
      success: true,
      message: 'STK Push initiated successfully.',
      checkoutRequestId: data.CheckoutRequestID, 
      merchantRequestId: data.MerchantRequestID,
      responseCode: data.ResponseCode,
    };
  }

  @Get('stkpush-query')
  async checkStatus(@Query('checkoutRequestId') checkoutRequestId: string) {
    const data = await this.mpesaService.queryStatus(checkoutRequestId);
    return { 
      success: true, 
      status: data.ResultCode === '0' ? 'COMPLETED' : 'PENDING/FAILED',
      ...data 
    };
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Body() callbackData: any) {
    this.logger.log('Received M-Pesa Callback');
    await this.mpesaService.handleCallback(callbackData);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }
}