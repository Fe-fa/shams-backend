import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NoShowPredictionRequest } from './dto/noshow-prediction.dto';
import { AiService } from './ai.service';
import { WaitTimePredictionRequest } from './dto/waittime-prediction.dto';
import { PriorityClassificationRequest } from './dto/priority-classification.dto';
import { BatchPredictionRequest } from './dto/batch-prediction.dto';
import { QueueOptimizationRequest } from './dto/queue-optimization.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('predict-noshow')
  predictNoShow(@Body() request: NoShowPredictionRequest, @CurrentUser() user: any) {
    return this.aiService.predictNoShow(request, user.id);
  }

  @Post('estimate-wait-time')
  estimateWaitTime(@Body() request: WaitTimePredictionRequest) {
    return this.aiService.estimateWaitTime(request);
  }

  @Post('classify-priority')
  classifyPriority(@Body() request: PriorityClassificationRequest) {
    return this.aiService.classifyPriority(request);
  }

  @Post('optimize-queue')
  optimizeQueue(@Body() request: QueueOptimizationRequest) {
    return this.aiService.optimizeQueue(request);
  }

  @Post('batch-predict')
  batchPredict(@Body() request: BatchPredictionRequest) {
    return this.aiService.batchPredict(request);
  }

  @Get('health')
  healthCheck() {
    return this.aiService.healthCheck();
  }
}