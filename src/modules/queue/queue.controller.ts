import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueGateway } from './queue.gateway';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QueueStatus } from '@prisma/client';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly queueGateway: QueueGateway,
  ) {}

  @Post()
  async create(@Body() createQueueDto: CreateQueueDto) {
    const queue = await this.queueService.create(createQueueDto);
    
    // Emit real-time update
    this.queueGateway.emitQueueUpdate(queue.department, queue);
    
    return queue;
  }

  @Get()
  findAll(@Query('department') department?: string, @Query('status') status?: QueueStatus) {
    return this.queueService.findAll(department, status);
  }

  @Get('my-position')
  getMyPosition(@CurrentUser() user: any) {
    return this.queueService.getPatientPosition(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.queueService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateQueueDto: UpdateQueueDto) {
    const queue = await this.queueService.update(id, updateQueueDto);
    
    // Emit real-time update
    this.queueGateway.emitQueueUpdate(queue.department, queue);
    
    if (updateQueueDto.status === 'CALLED') {
      this.queueGateway.emitPatientCalled(queue.department, queue);
    }
    
    return queue;
  }
}