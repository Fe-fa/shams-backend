import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const today = new Date();
    const startToday = startOfDay(today);
    const endToday = endOfDay(today);

    const [
      totalPatients,
      totalDoctors,
      totalAppointments,
      todayAppointments,
      completedAppointments,
      cancelledAppointments,
      noShows,
      activeQueue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PATIENT' } }),
      this.prisma.user.count({ where: { role: 'DOCTOR' } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({
        where: {
          appointmentDate: { gte: startToday, lte: endToday },
        },
      }),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.appointment.count({ where: { status: 'CANCELLED' } }),
      this.prisma.appointment.count({ where: { status: 'NO_SHOW' } }),
      this.prisma.queue.count({
        where: {
          queueDate: { gte: startToday },
          status: { in: ['WAITING', 'CALLED'] },
        },
      }),
    ]);

    return {
      totalPatients,
      totalDoctors,
      totalAppointments,
      todayAppointments,
      completedAppointments,
      cancelledAppointments,
      noShows,
      activeQueue,
      noShowRate: totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0,
      cancellationRate: totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0,
    };
  }

  async getAppointmentTrends(days: number = 30) {
    const startDate = subDays(new Date(), days);

    const appointments = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    return appointments.map((item) => ({
      status: item.status,
      count: item._count,
    }));
  }

  async getDoctorPerformance() {
    const doctors = await this.prisma.user.findMany({
      where: { role: 'DOCTOR' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialization: true,
        doctorAppointments: {
          select: {
            status: true,
            actualStartTime: true,
            actualEndTime: true,
          },
        },
      },
    });

    return doctors.map((doctor) => {
      const total = doctor.doctorAppointments.length;
      const completed = doctor.doctorAppointments.filter((a) => a.status === 'COMPLETED').length;
      const cancelled = doctor.doctorAppointments.filter((a) => a.status === 'CANCELLED').length;
      const noShows = doctor.doctorAppointments.filter((a) => a.status === 'NO_SHOW').length;

      // Calculate average consultation time
      const consultations = doctor.doctorAppointments.filter(
        (a) => a.actualStartTime && a.actualEndTime
      );

      let avgConsultationTime = 0;
      if (consultations.length > 0) {
        const totalTime = consultations.reduce((sum, a) => {
          const duration =
            (new Date(a.actualEndTime!).getTime() - new Date(a.actualStartTime!).getTime()) / 60000;
          return sum + duration;
        }, 0);
        avgConsultationTime = Math.round(totalTime / consultations.length);
      }

      return {
        doctorId: doctor.id,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        totalAppointments: total,
        completed,
        cancelled,
        noShows,
        avgConsultationTime,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
      };
    });
  }

  async getWaitTimeAnalysis() {
    const queues = await this.prisma.queue.findMany({
      where: {
        status: 'COMPLETED',
        actualWaitTime: { not: null },
      },
      select: {
        department: true,
        actualWaitTime: true,
        serviceType: true,
      },
    });

    const departmentStats = queues.reduce((acc: Record<string, any>, queue) => {
      if (!acc[queue.department]) {
        acc[queue.department] = {
          department: queue.department,
          totalWaitTime: 0,
          count: 0,
        };
      }

      acc[queue.department].totalWaitTime += queue.actualWaitTime;
      acc[queue.department].count += 1;

      return acc;
    }, {});

    return Object.values(departmentStats).map((stat: any) => ({
      department: stat.department,
      avgWaitTime: Math.round(stat.totalWaitTime / stat.count),
      totalPatients: stat.count,
    }));
  }

  async getMonthlyReport() {
    const startDate = startOfMonth(new Date());
    const endDate = endOfMonth(new Date());

    const [appointments, queues, notifications] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        select: { status: true, appointmentType: true },
      }),
      this.prisma.queue.findMany({
        where: {
          queueDate: { gte: startDate, lte: endDate },
        },
        select: { status: true, actualWaitTime: true },
      }),
      this.prisma.notification.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'SENT',
        },
      }),
    ]);

    return {
      period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      totalAppointments: appointments.length,
      appointmentsByStatus: appointments.reduce((acc: Record<string, number>, apt) => {
        acc[apt.status] = (acc[apt.status] || 0) + 1;
        return acc;
      }, {}),
      appointmentsByType: appointments.reduce((acc: Record<string, number>, apt) => {
        acc[apt.appointmentType] = (acc[apt.appointmentType] || 0) + 1;
        return acc;
      }, {}),
      totalQueueProcessed: queues.length,
      avgWaitTime:
        queues.length > 0
          ? Math.round(
              queues.reduce((sum, q) => sum + (q.actualWaitTime || 0), 0) / queues.length
            )
          : 0,
      notificationsSent: notifications,
    };
  }
}
