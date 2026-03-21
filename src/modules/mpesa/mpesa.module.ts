import { Module } from '@nestjs/common';
import { MpesaController } from './mpesa.controller';
import { MpesaService } from './mpesa.service';
import { MpesaGateway } from './mpesa.gateway';

@Module({
  controllers: [MpesaController],
  providers: [MpesaService, MpesaGateway],
  exports: [MpesaService, MpesaGateway],
})
export class MpesaModule {}