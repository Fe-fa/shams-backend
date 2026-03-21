import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DOCTOR')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('appointment-trends')
  getAppointmentTrends(@Query('days') days?: string) {
    return this.analyticsService.getAppointmentTrends(days ? parseInt(days, 10) : 30);
  }

  @Get('doctor-performance')
  getDoctorPerformance() {
    return this.analyticsService.getDoctorPerformance();
  }

  @Get('wait-time-analysis')
  getWaitTimeAnalysis() {
    return this.analyticsService.getWaitTimeAnalysis();
  }

  @Get('monthly-report')
  getMonthlyReport() {
    return this.analyticsService.getMonthlyReport();
  }
}