import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { FilterAppointmentDto } from './dto/filter-appointment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ─── Create ────────────────────────────────────────────────────────────────
  @Post()
  @Roles('PATIENT')
  create(@CurrentUser() user: any, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(user.id, dto);
  }

  // ─── Confirm (ADMIN / NURSE only) ─────────────────────────────────────────
  @Post(':id/confirm')
  @Roles('ADMIN', 'NURSE')
  confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.appointmentsService.confirmAppointment(id, user.id);
  }

  // ─── List ──────────────────────────────────────────────────────────────────
  @Get()
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'PATIENT')
  findAll(@CurrentUser() user: any, @Query() filterDto: FilterAppointmentDto) {
    return this.appointmentsService.findAll(filterDto, user.id, user.role);
  }

  // ─── Upcoming ──────────────────────────────────────────────────────────────
  @Get('upcoming')
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'PATIENT')
  getUpcoming(@CurrentUser() user: any) {
    return this.appointmentsService.getUpcoming(user.id, user.role);
  }

  // ─── History ───────────────────────────────────────────────────────────────
  @Get('history')
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'PATIENT')
  getHistory(@CurrentUser() user: any) {
    return this.appointmentsService.getHistory(user.id, user.role);
  }

  // ─── Single ────────────────────────────────────────────────────────────────
  @Get(':id')
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'PATIENT')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.appointmentsService.findOne(id, user.id, user.role);
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'PATIENT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.update(id, dto, user.id, user.role);
  }

  // ─── Cancel ────────────────────────────────────────────────────────────────
  @Delete(':id')
  @Roles('ADMIN', 'NURSE', 'PATIENT')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.appointmentsService.cancel(id, user.id, user.role);
  }
}
