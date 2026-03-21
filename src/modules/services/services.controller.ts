import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AppointmentType } from '@prisma/client';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // ─── PUBLIC: active services list (used in booking modal) ─────────────────
  @Public()
  @Get('active')
  findActive() {
    return this.servicesService.findActive();
  }

  // ─── PUBLIC: services by appointment type ─────────────────────────────────
  @Public()
  @Get('by-type')
  findByType(@Query('type') type: AppointmentType) {
    return this.servicesService.findByType(type);
  }

  // ─── ADMIN: create service ────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  // ─── ADMIN: list all services ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  // ─── ADMIN: stats ─────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('stats')
  getStats() {
    return this.servicesService.getStats();
  }

  // ─── ADMIN: single ────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.findOne(id);
  }

  // ─── ADMIN: update ────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, dto);
  }

  // ─── ADMIN: toggle active ─────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/toggle')
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.toggleActive(id);
  }

  // ─── ADMIN: delete (soft if in use) ──────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.remove(id);
  }
}