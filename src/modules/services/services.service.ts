import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AppointmentType } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────
  async create(dto: CreateServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Service "${dto.name}" already exists`);
    }

    return this.prisma.service.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        type: dto.type,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ─── Find All (admin) ─────────────────────────────────────────────────────
  async findAll() {
    return this.prisma.service.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  // ─── Find Active (public — used by booking flow) ──────────────────────────
  async findActive() {
    return this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  // ─── Find By Type (used when patient selects appointment type) ────────────
  async findByType(type: AppointmentType) {
    return this.prisma.service.findMany({
      where: { type, isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  // ─── Find One ─────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException(`Service #${id} not found`);
    return service;
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateServiceDto) {
    await this.findOne(id);

    if (dto.name) {
      const nameConflict = await this.prisma.service.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (nameConflict) {
        throw new ConflictException(`Service name "${dto.name}" is already taken`);
      }
    }

    return this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price       !== undefined && { price:       dto.price }),
        ...(dto.type        !== undefined && { type:        dto.type }),
        ...(dto.isActive    !== undefined && { isActive:    dto.isActive }),
      },
    });
  }

  // ─── Toggle Active ────────────────────────────────────────────────────────
  async toggleActive(id: number) {
    const service = await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: { isActive: !service.isActive },
    });
  }

  // ─── Remove ───────────────────────────────────────────────────────────────
  async remove(id: number) {
    await this.findOne(id);
    // Soft-delete: just deactivate if used in appointments
    const usageCount = await this.prisma.appointment.count({
      where: { serviceId: id },
    });
    if (usageCount > 0) {
      return this.prisma.service.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return this.prisma.service.delete({ where: { id } });
  }

  // ─── Summary stats ────────────────────────────────────────────────────────
  async getStats() {
    const [total, active] = await Promise.all([
      this.prisma.service.count(),
      this.prisma.service.count({ where: { isActive: true } }),
    ]);
    const byType = await this.prisma.service.groupBy({
      by: ['type'],
      _count: { id: true },
    });
    return { total, active, inactive: total - active, byType };
  }
}