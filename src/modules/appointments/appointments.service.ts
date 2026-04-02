import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { FilterAppointmentDto } from './dto/filter-appointment.dto';
import { AppointmentStatus } from '@prisma/client';
import { format } from 'date-fns';

const PATIENT_SELECT = {
  id: true, email: true, phone: true, firstName: true, lastName: true,
} as const;

const PATIENT_FULL_SELECT = {
  ...PATIENT_SELECT, bloodType: true, allergies: true, medicalHistory: true,
} as const;

const DOCTOR_SELECT = {
  id: true, email: true, firstName: true, lastName: true, specialization: true,
} as const;

const DOCTOR_FULL_SELECT = { ...DOCTOR_SELECT, department: true } as const;

const DEFAULT_INCLUDE = {
  patient: { select: PATIENT_SELECT },
  doctor:  { select: DOCTOR_SELECT },
  payment: { select: { id: true, status: true, amount: true, method: true, paidAt: true } },
  service: { select: { id: true, name: true, price: true, type: true } },
} as const;

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private smsService: SmsService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────
  async create(patientId: number, dto: CreateAppointmentDto) {
    const appointmentDate = new Date(dto.appointmentDate);

    if (dto.doctorId) {
      const doctor = await this.prisma.user.findUnique({ where: { id: dto.doctorId } });
      if (!doctor || doctor.role !== 'DOCTOR') {
        throw new BadRequestException('Invalid doctor ID');
      }
      const duration = dto.durationMinutes ?? 30;
      const conflicts = await this.prisma.appointment.findMany({
        where: {
          doctorId: dto.doctorId,
          appointmentDate: {
            gte: appointmentDate,
            lt: new Date(appointmentDate.getTime() + duration * 60_000),
          },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        },
      });
      if (conflicts.length > 0) {
        throw new BadRequestException('Doctor is not available at this time');
      }
    }

    // Resolve service for this appointment type
    const service = await this.prisma.service.findFirst({
      where: { type: dto.appointmentType, isActive: true },
      orderBy: { price: 'asc' },
    });

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId,
        doctorId:       dto.doctorId ?? null,
        appointmentDate,
        appointmentType: dto.appointmentType,
        priority:        dto.priority       ?? 'MEDIUM',
        durationMinutes: dto.durationMinutes ?? 30,
        chiefComplaint:  dto.chiefComplaint,
        symptoms:        dto.symptoms,
        notes:           dto.notes,
        serviceId:       service?.id ?? null,
      },
      include: DEFAULT_INCLUDE,
    });

    // Notify patient — booking confirmation
    try {
      const doctorName = appointment.doctor
        ? `${appointment.doctor.firstName} ${appointment.doctor.lastName}`
        : 'To be assigned';

      await this.notificationsService.notifyAll(
        patientId,
        appointment.id,
        {
          title: 'Appointment Booked',
          inApp: `Your ${appointment.appointmentType.replace('_', ' ')} appointment on ${format(appointmentDate, 'MMM dd, yyyy')} at ${format(appointmentDate, 'hh:mm a')} has been booked. Please complete payment to confirm.`,
          email: this.buildBookingEmail(appointment, doctorName),
          sms: `SHAMS: Appointment booked for ${format(appointmentDate, 'MMM dd')} at ${format(appointmentDate, 'hh:mm a')} with ${doctorName}. Complete payment to confirm. Login to SHAMS to pay.`,
          recipientEmail: appointment.patient.email,
          recipientPhone: appointment.patient.phone,
        },
      );
    } catch (err) {
      console.error('Booking notification failed:', err);
    }

    return appointment;
  }

  // ─── Confirm (ADMIN / NURSE) — REQUIRES completed payment ─────────────────
  async confirmAppointment(id: number, confirmedBy: number) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: PATIENT_SELECT },
        doctor:  { select: DOCTOR_SELECT  },
        payment: true,
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const confirmableStatuses: AppointmentStatus[] = [
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.RESCHEDULED,
    ];
    if (!confirmableStatuses.includes(appointment.status)) {
      throw new BadRequestException(
        `Cannot confirm an appointment with status "${appointment.status}"`,
      );
    }

    // ⚠️ Payment guard
    if (!appointment.payment || appointment.payment.status !== 'COMPLETED') {
      throw new BadRequestException(
        'This appointment cannot be confirmed until the patient completes payment.',
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CONFIRMED, confirmedAt: new Date() },
      include: DEFAULT_INCLUDE,
    });

    // Notify patient — confirmation
    try {
      const doctorName = updated.doctor
        ? `${updated.doctor.firstName} ${updated.doctor.lastName}`
        : 'To be assigned';

      await this.notificationsService.notifyAll(
        appointment.patientId,
        appointment.id,
        {
          title: '✅ Appointment Confirmed',
          inApp: `Your appointment on ${format(updated.appointmentDate, 'MMM dd, yyyy')} at ${format(updated.appointmentDate, 'hh:mm a')} with ${doctorName} is now CONFIRMED!`,
          email: this.buildConfirmationEmail(updated, doctorName),
          sms: `SHAMS: Your appointment with ${doctorName} on ${format(updated.appointmentDate, 'MMM dd')} at ${format(updated.appointmentDate, 'hh:mm a')} is CONFIRMED. Please arrive 15 mins early.`,
          recipientEmail: appointment.patient.email,
          recipientPhone: appointment.patient.phone,
        },
      );
    } catch (err) {
      console.error('Confirmation notification failed:', err);
    }

    return updated;
  }

  // ─── Find All ─────────────────────────────────────────────────────────────
  async findAll(filterDto: FilterAppointmentDto, userId: number, userRole: string) {
    const { page = 1, limit = 10, ...filters } = filterDto;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (userRole === 'PATIENT')      where.patientId = userId;
    else if (userRole === 'DOCTOR')  where.doctorId  = userId;
    else {
      if (filters.patientId) where.patientId = filters.patientId;
      if (filters.doctorId)  where.doctorId  = filters.doctorId;
    }

    if (filters.status)          where.status          = filters.status;
    if (filters.appointmentType) where.appointmentType = filters.appointmentType;

    if (filters.startDate || filters.endDate) {
      where.appointmentDate = {};
      if (filters.startDate) where.appointmentDate.gte = new Date(filters.startDate);
      if (filters.endDate)   where.appointmentDate.lte = new Date(filters.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where, skip, take: limit,
        include: DEFAULT_INCLUDE,
        orderBy: { appointmentDate: 'desc' },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────
  async findOne(id: number, userId: number, userRole: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: PATIENT_FULL_SELECT },
        doctor:  { select: DOCTOR_FULL_SELECT  },
        payment: true,
        service: true,
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (userRole === 'PATIENT' && appointment.patientId !== userId)
      throw new ForbiddenException('You can only view your own appointments');
    if (userRole === 'DOCTOR'  && appointment.doctorId  !== userId)
      throw new ForbiddenException('You can only view your own appointments');
    return appointment;
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateAppointmentDto, userId: number, userRole: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const isAdminLike = userRole === 'ADMIN' || userRole === 'NURSE';
    if (!isAdminLike) {
      if (userRole === 'PATIENT' && appointment.patientId !== userId)
        throw new ForbiddenException('You can only update your own appointments');
      if (userRole === 'DOCTOR' && appointment.doctorId !== userId)
        throw new ForbiddenException('You can only update your own appointments');
      if (userRole === 'PATIENT' && dto.status) {
        const allowed: string[] = [AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED];
        if (!allowed.includes(dto.status))
          throw new ForbiddenException('Patients can only cancel or reschedule appointments');
      }
      if (dto.doctorId !== undefined)
        throw new ForbiddenException('Only admin or nurse can assign a doctor');
    }

    if (dto.doctorId) {
      const doctor = await this.prisma.user.findUnique({ where: { id: dto.doctorId } });
      if (!doctor || doctor.role !== 'DOCTOR') throw new BadRequestException('Invalid doctor ID');
    }

    const updateData: any = { ...dto };
    if (dto.appointmentDate) updateData.appointmentDate = new Date(dto.appointmentDate);
    if (dto.status === AppointmentStatus.CONFIRMED  && !appointment.confirmedAt)  updateData.confirmedAt  = new Date();
    if (dto.status === AppointmentStatus.IN_PROGRESS && !appointment.actualStartTime) updateData.actualStartTime = new Date();
    if (dto.status === AppointmentStatus.COMPLETED  && !appointment.actualEndTime) updateData.actualEndTime = new Date();
    if (dto.checkedIn && !appointment.checkedIn) updateData.checkInTime = new Date();

    return this.prisma.appointment.update({
      where: { id },
      data: updateData,
      include: DEFAULT_INCLUDE,
    });
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────
  async cancel(id: number, userId: number, userRole: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: { select: PATIENT_SELECT } },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const isAdminLike = userRole === 'ADMIN' || userRole === 'NURSE';
    if (!isAdminLike && userRole === 'PATIENT' && appointment.patientId !== userId)
      throw new ForbiddenException('You can only cancel your own appointments');
    const nonCancellableStatuses: readonly AppointmentStatus[] = [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED];
    if (nonCancellableStatuses.includes(appointment.status))
      throw new BadRequestException('Cannot cancel this appointment');

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: DEFAULT_INCLUDE,
    });

    // Notify patient
    try {
      await this.notificationsService.notifyAll(
        appointment.patientId,
        appointment.id,
        {
          title: '❌ Appointment Cancelled',
          inApp: `Your appointment on ${format(appointment.appointmentDate, 'MMM dd, yyyy')} has been cancelled.`,
          email: `<p>Your appointment on <strong>${format(appointment.appointmentDate, 'MMMM dd, yyyy')}</strong> has been cancelled. If you paid, a refund will be processed.</p>`,
          sms: `SHAMS: Your appointment on ${format(appointment.appointmentDate, 'MMM dd')} has been cancelled. Contact us for refund queries.`,
          recipientEmail: appointment.patient.email,
          recipientPhone: appointment.patient.phone,
        },
      );
    } catch (err) {
      console.error('Cancel notification failed:', err);
    }

    return updated;
  }

  // ─── Upcoming ─────────────────────────────────────────────────────────────
  async getUpcoming(userId: number, userRole: string) {
    const where: any = {
      appointmentDate: { gte: new Date() },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
    };
    if (userRole === 'PATIENT') where.patientId = userId;
    else if (userRole === 'DOCTOR') where.doctorId = userId;
    return this.prisma.appointment.findMany({
      where, include: DEFAULT_INCLUDE, orderBy: { appointmentDate: 'asc' }, take: 10,
    });
  }

  // ─── History ──────────────────────────────────────────────────────────────
  async getHistory(userId: number, userRole: string) {
    const where: any = {
      status: { in: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
    };
    if (userRole === 'PATIENT') where.patientId = userId;
    else if (userRole === 'DOCTOR') where.doctorId = userId;
    return this.prisma.appointment.findMany({
      where, include: DEFAULT_INCLUDE, orderBy: { appointmentDate: 'desc' }, take: 50,
    });
  }

  // ─── Email builders ───────────────────────────────────────────────────────
  private buildBookingEmail(appt: any, doctorName: string): string {
    const price = appt.service ? `KES ${Number(appt.service.price).toLocaleString()}` : 'See admin';
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
          <h1 style="color:#fff;margin:0;">📅 Appointment Booked</h1>
        </div>
        <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
          <h2>Hello ${appt.patient.firstName}!</h2>
          <p>Your appointment has been successfully booked.</p>
          <div style="background:#fff;border-left:4px solid #3b82f6;padding:20px;margin:20px 0;">
            <p><strong>Doctor:</strong> ${doctorName}</p>
            <p><strong>Date:</strong> ${format(new Date(appt.appointmentDate), 'MMMM dd, yyyy')}</p>
            <p><strong>Time:</strong> ${format(new Date(appt.appointmentDate), 'hh:mm a')}</p>
            <p><strong>Type:</strong> ${appt.appointmentType.replace('_', ' ')}</p>
            <p><strong>Amount Due:</strong> ${price}</p>
          </div>
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:15px;margin:15px 0;">
            <p style="margin:0;color:#92400e;"><strong>⚠️ Action Required:</strong> Please complete payment to confirm your appointment. Log in to SHAMS to pay.</p>
          </div>
        </div>
      </div>
    `;
  }

  private buildConfirmationEmail(appt: any, doctorName: string): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#10b981,#059669);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
          <h1 style="color:#fff;margin:0;">✅ Appointment Confirmed</h1>
        </div>
        <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
          <h2>Hello ${appt.patient.firstName}!</h2>
          <p>Your appointment is now <strong>CONFIRMED</strong>.</p>
          <div style="background:#fff;border-left:4px solid #10b981;padding:20px;margin:20px 0;">
            <p><strong>Doctor:</strong> ${doctorName}</p>
            <p><strong>Date:</strong> ${format(new Date(appt.appointmentDate), 'MMMM dd, yyyy')}</p>
            <p><strong>Time:</strong> ${format(new Date(appt.appointmentDate), 'hh:mm a')}</p>
            <p><strong>Type:</strong> ${appt.appointmentType.replace('_', ' ')}</p>
          </div>
          <p>Please arrive 15 minutes early to complete check-in procedures.</p>
        </div>
      </div>
    `;
  }
}