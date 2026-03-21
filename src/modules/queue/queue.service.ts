import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { QueueStatus } from '@prisma/client';

@Injectable()
export class QueueService {
  constructor(private prisma: PrismaService) {}

  async create(createQueueDto: CreateQueueDto) {
    // Get next queue number for the department
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastQueue = await this.prisma.queue.findFirst({
      where: {
        department: createQueueDto.department,
        queueDate: {
          gte: today,
        },
      },
      orderBy: {
        queueNumber: 'desc',
      },
    });

    const queueNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;

    // Calculate priority score
    let priorityScore = 1.0;
    if (createQueueDto.isEmergency) {
      priorityScore = 5.0;
    } else if (createQueueDto.priorityLevel === 'HIGH') {
      priorityScore = 3.0;
    } else if (createQueueDto.priorityLevel === 'MEDIUM') {
      priorityScore = 2.0;
    }

    return this.prisma.queue.create({
      data: {
        queueDate: new Date(),
        department: createQueueDto.department,
        queueNumber,
        patientId: createQueueDto.patientId,
        appointmentId: createQueueDto.appointmentId,
        patientName: createQueueDto.patientName,
        serviceType: createQueueDto.serviceType,
        doctorName: createQueueDto.doctorName,
        priorityLevel: createQueueDto.priorityLevel || 'MEDIUM',
        priorityScore,
        isEmergency: createQueueDto.isEmergency || false,
        checkInTime: new Date(),
      },
    });
  }

  async findAll(department?: string, status?: QueueStatus) {
    const where: any = {
      queueDate: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    };

    if (department) where.department = department;
    if (status) where.status = status;

    return this.prisma.queue.findMany({
      where,
      orderBy: [{ priorityScore: 'desc' }, { queueNumber: 'asc' }],
    });
  }

  async findOne(id: number) {
    const queue = await this.prisma.queue.findUnique({
      where: { id },
    });

    if (!queue) {
      throw new NotFoundException('Queue entry not found');
    }

    return queue;
  }

  async update(id: number, updateQueueDto: UpdateQueueDto) {
    const queue = await this.findOne(id);

    const updateData: any = { ...updateQueueDto };

    if (updateQueueDto.calledTime) {
      updateData.calledTime = new Date(updateQueueDto.calledTime);
    }

    if (updateQueueDto.serviceStartTime) {
      updateData.serviceStartTime = new Date(updateQueueDto.serviceStartTime);
    }

    if (updateQueueDto.serviceEndTime) {
      updateData.serviceEndTime = new Date(updateQueueDto.serviceEndTime);

      // Calculate actual wait time
      if (queue.checkInTime && updateData.serviceStartTime) {
        const waitTime = Math.round(
          (new Date(updateData.serviceStartTime).getTime() - queue.checkInTime.getTime()) / 60000
        );
        updateData.actualWaitTime = waitTime;
      }
    }

    return this.prisma.queue.update({
      where: { id },
      data: updateData,
    });
  }

  async getPatientPosition(patientId: number) {
    const queue = await this.prisma.queue.findFirst({
      where: {
        patientId,
        queueDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
        status: { in: ['WAITING', 'CALLED'] },
      },
    });

    if (!queue) {
      return null;
    }

    // Count how many are ahead
    const aheadCount = await this.prisma.queue.count({
      where: {
        department: queue.department,
        queueDate: queue.queueDate,
        status: { in: ['WAITING', 'CALLED'] },
        OR: [
          { priorityScore: { gt: queue.priorityScore } },
          {
            priorityScore: queue.priorityScore,
            queueNumber: { lt: queue.queueNumber },
          },
        ],
      },
    });

    return {
      ...queue,
      position: aheadCount + 1,
    };
  }
}
