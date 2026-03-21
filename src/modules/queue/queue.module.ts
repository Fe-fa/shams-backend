import { Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { QueueGateway } from './queue.gateway';

@Module({
  controllers: [QueueController],
  providers: [QueueService, QueueGateway],
  exports: [QueueService, QueueGateway],
})
export class QueueModule {}
