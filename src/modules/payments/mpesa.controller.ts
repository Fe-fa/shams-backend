import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('payments/mpesa')
export class MpesaController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('callback')
  async handleCallback(@Body() body: any, @Res() res: Response) {
    await this.paymentsService.handleMpesaCallback(body);
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  }
}