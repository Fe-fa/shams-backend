import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { MpesaService } from './mpesa.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { FilterPaymentDto } from './dto/filter-payment.dto';
import {
  PaymentStatus,
  NotificationType,
  PaymentMethod,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { format } from 'date-fns';

const PAYMENT_INCLUDE = {
  appointment: {
    select: {
      id: true,
      appointmentDate: true,
      appointmentType: true,
      status: true,
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      doctor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialization: true,
        },
      },
    },
  },
  service: true,
} as const;

const TRANSACTION_INCLUDE = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  appointment: {
    select: {
      id: true,
      appointmentDate: true,
      appointmentType: true,
      status: true,
    },
  },
  service: {
    select: { id: true, name: true, type: true },
  },
  payment: {
    select: {
      id: true,
      method: true,
      status: true,
      paidAt: true,
      phoneNumber: true,
    },
  },
} as const;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private notificationsGateway: NotificationsGateway,
    private mpesaService: MpesaService,
    private configService: ConfigService,
  ) {}

  private generateReference(): string {
    const date = format(new Date(), 'yyyyMMdd');
    const random = randomBytes(4).toString('hex').toUpperCase();
    return `TXN-${date}-${random}`;
  }

  private async getPaymentContext(patientId: number, dto: CreatePaymentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        service: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.patientId !== patientId) {
      throw new ForbiddenException('You can only pay for your own appointments');
    }

    if (
      appointment.status === 'CANCELLED' ||
      appointment.status === 'COMPLETED'
    ) {
      throw new BadRequestException(
        `Cannot process payment for a ${appointment.status} appointment`,
      );
    }

    const existingPayment = await this.prisma.payment.findUnique({
      where: { appointmentId: dto.appointmentId },
      include: { transaction: true },
    });

    if (existingPayment && existingPayment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('This appointment has already been paid');
    }

    let serviceId = dto.serviceId ?? appointment.serviceId ?? null;
    let amount: number;
    let serviceName = 'Medical Service';

    if (serviceId) {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
      });
      if (!service) throw new NotFoundException(`Service #${serviceId} not found`);
      amount = Number(service.price);
      serviceName = service.name;
    } else {
      const defaultService = await this.prisma.service.findFirst({
        where: { type: appointment.appointmentType, isActive: true },
        orderBy: { price: 'asc' },
      });

      if (!defaultService) {
        throw new BadRequestException(
          `No active service configured for ${appointment.appointmentType}. Please contact admin.`,
        );
      }

      serviceId = defaultService.id;
      amount = Number(defaultService.price);
      serviceName = defaultService.name;
    }

    return {
      appointment,
      existingPayment,
      serviceId,
      amount,
      serviceName,
    };
  }

  private emitPaymentStatus(
    userId: number,
    payload: {
      paymentId?: number;
      appointmentId: number;
      referenceNumber?: string;
      status: PaymentStatus;
      method?: PaymentMethod;
      checkoutRequestId?: string | null;
      externalRef?: string | null;
      amount?: number;
      message: string;
      customerMessage?: string;
    },
  ) {
    this.notificationsGateway.sendToUser(userId, 'payment.status', payload);
  }

  async create(patientId: number, dto: CreatePaymentDto) {
    const context = await this.getPaymentContext(patientId, dto);

    if (dto.method === PaymentMethod.MOBILE_MONEY) {
      return this.createMpesaPayment(patientId, dto, context);
    }

    return this.createInstantPayment(patientId, dto, context);
  }

  private async createInstantPayment(
    patientId: number,
    dto: CreatePaymentDto,
    context: Awaited<ReturnType<PaymentsService['getPaymentContext']>>,
  ) {
    const { appointment, existingPayment, serviceId, amount, serviceName } = context;
    const now = new Date();
    const referenceNumber =
      existingPayment?.transaction?.referenceNumber ?? this.generateReference();

    const payment = await this.prisma.$transaction(async (tx) => {
      let pay: any;

      if (existingPayment) {
        pay = await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount,
            status: PaymentStatus.COMPLETED,
            method: dto.method,
            transactionId: dto.externalRef ?? null,
            patientId,
            serviceId,
            notes: dto.notes,
            paidAt: now,
            phoneNumber: null,
          },
          include: PAYMENT_INCLUDE,
        });

        if (existingPayment.transaction) {
          await tx.transaction.update({
            where: { id: existingPayment.transaction.id },
            data: {
              amount,
              paymentMethod: dto.method,
              status: PaymentStatus.COMPLETED,
              externalRef: dto.externalRef ?? null,
              processedAt: now,
              description: `Payment for ${appointment.appointmentType.replace(
                /_/g,
                ' ',
              )} — ${serviceName}`,
              resultDesc: 'Completed manually/internal flow',
              resultCode: 0,
              phoneNumber: null,
            },
          });
        } else {
          await tx.transaction.create({
            data: {
              referenceNumber,
              paymentId: pay.id,
              patientId,
              appointmentId: dto.appointmentId,
              serviceId,
              amount,
              currency: 'KES',
              paymentMethod: dto.method,
              status: PaymentStatus.COMPLETED,
              externalRef: dto.externalRef ?? null,
              description: `Payment for ${appointment.appointmentType.replace(
                /_/g,
                ' ',
              )} — ${serviceName}`,
              processedAt: now,
              resultCode: 0,
              resultDesc: 'Completed manually/internal flow',
            },
          });
        }
      } else {
        pay = await tx.payment.create({
          data: {
            amount,
            status: PaymentStatus.COMPLETED,
            method: dto.method,
            transactionId: dto.externalRef ?? null,
            appointmentId: dto.appointmentId,
            patientId,
            serviceId,
            notes: dto.notes,
            currency: 'KES',
            paidAt: now,
            phoneNumber: null,
          },
          include: PAYMENT_INCLUDE,
        });

        await tx.transaction.create({
          data: {
            referenceNumber,
            paymentId: pay.id,
            patientId,
            appointmentId: dto.appointmentId,
            serviceId,
            amount,
            currency: 'KES',
            paymentMethod: dto.method,
            status: PaymentStatus.COMPLETED,
            externalRef: dto.externalRef ?? null,
            description: `Payment for ${appointment.appointmentType.replace(
              /_/g,
              ' ',
            )} — ${serviceName}`,
            processedAt: now,
            resultCode: 0,
            resultDesc: 'Completed manually/internal flow',
          },
        });
      }

      if (!appointment.serviceId && serviceId) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { serviceId },
        });
      }

      return pay;
    });

    this.sendPaymentNotifications(payment, referenceNumber, serviceName).catch(
      (err) => this.logger.error('Payment notification failed', err),
    );

    this.emitPaymentStatus(patientId, {
      paymentId: payment.id,
      appointmentId: dto.appointmentId,
      referenceNumber,
      status: PaymentStatus.COMPLETED,
      method: dto.method,
      externalRef: dto.externalRef ?? null,
      amount,
      message: `Payment of KES ${amount.toLocaleString()} confirmed successfully.`,
    });

    return {
      payment,
      referenceNumber,
      status: PaymentStatus.COMPLETED,
    };
  }

  private async createMpesaPayment(
    patientId: number,
    dto: CreatePaymentDto,
    context: Awaited<ReturnType<PaymentsService['getPaymentContext']>>,
  ) {
    const { appointment, existingPayment, serviceId, amount, serviceName } = context;

    if (!dto.phoneNumber?.trim()) {
      throw new BadRequestException('Phone number is required for M-Pesa payments');
    }

    const normalizedPhone = this.mpesaService.normalizePhoneNumber(dto.phoneNumber);
    const referenceNumber =
      existingPayment?.transaction?.referenceNumber ?? this.generateReference();

    const pendingPayment = await this.prisma.$transaction(async (tx) => {
      let pay: any;

      if (existingPayment) {
        pay = await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount,
            status: PaymentStatus.PENDING,
            method: PaymentMethod.MOBILE_MONEY,
            transactionId: null,
            patientId,
            serviceId,
            notes: dto.notes,
            paidAt: null,
            phoneNumber: normalizedPhone,
          },
          include: PAYMENT_INCLUDE,
        });

        if (existingPayment.transaction) {
          await tx.transaction.update({
            where: { id: existingPayment.transaction.id },
            data: {
              amount,
              paymentMethod: PaymentMethod.MOBILE_MONEY,
              status: PaymentStatus.PENDING,
              externalRef: null,
              processedAt: null,
              description: `M-Pesa payment for ${appointment.appointmentType.replace(
                /_/g,
                ' ',
              )} — ${serviceName}`,
              phoneNumber: normalizedPhone,
              merchantRequestId: null,
              checkoutRequestId: null,
              resultCode: null,
              resultDesc: 'Awaiting STK authorization',
            },
          });
        } else {
          await tx.transaction.create({
            data: {
              referenceNumber,
              paymentId: pay.id,
              patientId,
              appointmentId: dto.appointmentId,
              serviceId,
              amount,
              currency: 'KES',
              paymentMethod: PaymentMethod.MOBILE_MONEY,
              status: PaymentStatus.PENDING,
              description: `M-Pesa payment for ${appointment.appointmentType.replace(
                /_/g,
                ' ',
              )} — ${serviceName}`,
              phoneNumber: normalizedPhone,
              resultDesc: 'Awaiting STK authorization',
            },
          });
        }
      } else {
        pay = await tx.payment.create({
          data: {
            amount,
            status: PaymentStatus.PENDING,
            method: PaymentMethod.MOBILE_MONEY,
            appointmentId: dto.appointmentId,
            patientId,
            serviceId,
            notes: dto.notes,
            currency: 'KES',
            phoneNumber: normalizedPhone,
          },
          include: PAYMENT_INCLUDE,
        });

        await tx.transaction.create({
          data: {
            referenceNumber,
            paymentId: pay.id,
            patientId,
            appointmentId: dto.appointmentId,
            serviceId,
            amount,
            currency: 'KES',
            paymentMethod: PaymentMethod.MOBILE_MONEY,
            status: PaymentStatus.PENDING,
            description: `M-Pesa payment for ${appointment.appointmentType.replace(
              /_/g,
              ' ',
            )} — ${serviceName}`,
            phoneNumber: normalizedPhone,
            resultDesc: 'Awaiting STK authorization',
          },
        });
      }

      if (!appointment.serviceId && serviceId) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { serviceId },
        });
      }

      return pay;
    });

    try {
      const prefix = this.configService.get<string>(
        'MPESA_ACCOUNT_REFERENCE_PREFIX',
        'SHAMS',
      );

      const stk = await this.mpesaService.initiateStkPush({
        amount,
        phoneNumber: normalizedPhone,
        accountReference: `${prefix}-${appointment.id}`,
        transactionDesc: `Payment for ${serviceName}`,
      });

      const updatedPayment = await this.prisma.$transaction(async (tx) => {
        const pay = await tx.payment.update({
          where: { id: pendingPayment.id },
          data: {
            transactionId: stk.CheckoutRequestID,
          },
          include: PAYMENT_INCLUDE,
        });

        await tx.transaction.update({
          where: { paymentId: pendingPayment.id },
          data: {
            merchantRequestId: stk.MerchantRequestID,
            checkoutRequestId: stk.CheckoutRequestID,
            resultDesc: stk.ResponseDescription,
          },
        });

        return pay;
      });

      this.emitPaymentStatus(patientId, {
        paymentId: updatedPayment.id,
        appointmentId: dto.appointmentId,
        referenceNumber,
        status: PaymentStatus.PENDING,
        method: PaymentMethod.MOBILE_MONEY,
        checkoutRequestId: stk.CheckoutRequestID,
        amount,
        customerMessage: stk.CustomerMessage,
        message:
          stk.CustomerMessage ||
          'STK push sent successfully. Complete payment on your phone.',
      });

      return {
        payment: updatedPayment,
        referenceNumber,
        checkoutRequestId: stk.CheckoutRequestID,
        customerMessage: stk.CustomerMessage,
        status: PaymentStatus.PENDING,
      };
    } catch (error: any) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: pendingPayment.id },
          data: {
            status: PaymentStatus.FAILED,
          },
        });

        await tx.transaction.update({
          where: { paymentId: pendingPayment.id },
          data: {
            status: PaymentStatus.FAILED,
            resultDesc:
              error?.response?.data?.errorMessage ||
              error?.message ||
              'Failed to initiate STK push',
            processedAt: new Date(),
          },
        });
      });

      this.emitPaymentStatus(patientId, {
        paymentId: pendingPayment.id,
        appointmentId: dto.appointmentId,
        referenceNumber,
        status: PaymentStatus.FAILED,
        method: PaymentMethod.MOBILE_MONEY,
        amount,
        message:
          error?.response?.data?.errorMessage ||
          error?.message ||
          'Failed to initiate M-Pesa payment',
      });

      throw error;
    }
  }

  private extractMpesaCallbackMetadata(items: any[] = []) {
    const map = new Map<string, any>();

    for (const item of items) {
      if (item?.Name) {
        map.set(item.Name, item.Value);
      }
    }

    return {
      amount: map.has('Amount') ? Number(map.get('Amount')) : undefined,
      mpesaReceiptNumber: map.has('MpesaReceiptNumber')
        ? String(map.get('MpesaReceiptNumber'))
        : undefined,
      phoneNumber: map.has('PhoneNumber')
        ? String(map.get('PhoneNumber'))
        : undefined,
      transactionDate: map.has('TransactionDate')
        ? String(map.get('TransactionDate'))
        : undefined,
    };
  }

  async handleMpesaCallback(body: any) {
    const callback = body?.Body?.stkCallback ?? body?.stkCallback;

    if (!callback) {
      this.logger.warn(`Invalid M-Pesa callback payload: ${JSON.stringify(body)}`);
      throw new BadRequestException('Invalid M-Pesa callback payload');
    }

    const merchantRequestId = callback.MerchantRequestID ?? null;
    const checkoutRequestId = callback.CheckoutRequestID ?? null;
    const resultCode = Number(callback.ResultCode ?? -1);
    const resultDesc = String(callback.ResultDesc ?? 'Unknown response');
    const meta = this.extractMpesaCallbackMetadata(callback?.CallbackMetadata?.Item);

    if (!checkoutRequestId) {
      throw new BadRequestException('Missing CheckoutRequestID in callback');
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { checkoutRequestId },
      include: {
        service: true,
        payment: {
          include: PAYMENT_INCLUDE,
        },
      },
    });

    if (!transaction) {
      this.logger.warn(
        `No transaction found for checkoutRequestId=${checkoutRequestId}`,
      );
      return;
    }

    if (
      transaction.payment.status === PaymentStatus.COMPLETED &&
      resultCode === 0
    ) {
      return;
    }

    if (
      transaction.payment.status === PaymentStatus.FAILED &&
      resultCode !== 0
    ) {
      return;
    }

    const paidAt = new Date();
    const serviceName =
      transaction.payment.service?.name ??
      transaction.service?.name ??
      'Medical Service';

    if (resultCode === 0) {
      const updatedPayment = await this.prisma.$transaction(async (tx) => {
        const pay = await tx.payment.update({
          where: { id: transaction.paymentId },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt,
            transactionId: meta.mpesaReceiptNumber ?? checkoutRequestId,
            phoneNumber: meta.phoneNumber ?? transaction.phoneNumber ?? undefined,
          },
          include: PAYMENT_INCLUDE,
        });

        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: PaymentStatus.COMPLETED,
            externalRef: meta.mpesaReceiptNumber ?? null,
            phoneNumber: meta.phoneNumber ?? transaction.phoneNumber ?? undefined,
            merchantRequestId: merchantRequestId ?? transaction.merchantRequestId,
            checkoutRequestId,
            resultCode,
            resultDesc,
            processedAt: paidAt,
            ...(meta.amount ? { amount: meta.amount } : {}),
          },
        });

        return pay;
      });

      this.sendPaymentNotifications(
        updatedPayment,
        transaction.referenceNumber,
        serviceName,
      ).catch((err) =>
        this.logger.error('Payment notification failed after callback', err),
      );

      this.emitPaymentStatus(transaction.patientId, {
        paymentId: transaction.paymentId,
        appointmentId: transaction.appointmentId,
        referenceNumber: transaction.referenceNumber,
        status: PaymentStatus.COMPLETED,
        method: transaction.paymentMethod,
        checkoutRequestId,
        externalRef: meta.mpesaReceiptNumber ?? null,
        amount: meta.amount ?? Number(transaction.amount),
        message: `Payment confirmed successfully. Receipt: ${
          meta.mpesaReceiptNumber ?? 'N/A'
        }`,
      });

      return;
    }

    const failedPayment = await this.prisma.$transaction(async (tx) => {
      const pay = await tx.payment.update({
        where: { id: transaction.paymentId },
        data: {
          status: PaymentStatus.FAILED,
          phoneNumber: meta.phoneNumber ?? transaction.phoneNumber ?? undefined,
        },
        include: PAYMENT_INCLUDE,
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentStatus.FAILED,
          phoneNumber: meta.phoneNumber ?? transaction.phoneNumber ?? undefined,
          merchantRequestId: merchantRequestId ?? transaction.merchantRequestId,
          checkoutRequestId,
          resultCode,
          resultDesc,
          processedAt: paidAt,
        },
      });

      return pay;
    });

    this.sendPaymentFailureNotification(
      failedPayment,
      transaction.referenceNumber,
      resultDesc,
    ).catch((err) =>
      this.logger.error('Payment failure notification failed', err),
    );

    this.emitPaymentStatus(transaction.patientId, {
      paymentId: transaction.paymentId,
      appointmentId: transaction.appointmentId,
      referenceNumber: transaction.referenceNumber,
      status: PaymentStatus.FAILED,
      method: transaction.paymentMethod,
      checkoutRequestId,
      amount: Number(transaction.amount),
      message: `Payment failed: ${resultDesc}`,
    });
  }

  private async sendPaymentFailureNotification(
    payment: any,
    referenceNumber: string,
    reason: string,
  ) {
    const appt = payment.appointment;
    const patient = appt?.patient;
    if (!patient) return;

    const amount = `KES ${Number(payment.amount).toLocaleString()}`;
    const serviceName = payment.service?.name ?? 'Medical Service';

    await this.notificationsService.notifyAll(patient.id, appt.id, {
      title: '❌ Payment Failed',
      inApp: `Your payment of ${amount} for ${serviceName} failed. Ref: ${referenceNumber}. Reason: ${reason}`,
      email: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;">❌ Payment Failed</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <p>Your payment could not be completed.</p>
            <div style="background:#fff;border-left:4px solid #ef4444;padding:20px;margin:20px 0;">
              <p><strong>Reference:</strong> ${referenceNumber}</p>
              <p><strong>Amount:</strong> ${amount}</p>
              <p><strong>Reason:</strong> ${reason}</p>
            </div>
            <p>Please try again.</p>
          </div>
        </div>
      `,
      sms: `SHAMS: Payment failed for ${serviceName}. Ref: ${referenceNumber}. Reason: ${reason}`,
      recipientEmail: patient.email,
      recipientPhone: patient.phone,
    });
  }

  private async sendPaymentNotifications(
    payment: any,
    referenceNumber: string,
    serviceName: string,
  ) {
    const appt = payment.appointment;
    const patient = appt.patient;
    if (!patient) return;

    const patientName = `${patient.firstName} ${patient.lastName}`;
    const amount = `KES ${Number(payment.amount).toLocaleString()}`;
    const apptDate = format(new Date(appt.appointmentDate), 'MMMM dd, yyyy');
    const apptTime = format(new Date(appt.appointmentDate), 'hh:mm a');

    await this.notificationsService.create({
      userId: patient.id,
      appointmentId: appt.id,
      notificationType: NotificationType.IN_APP,
      title: '✅ Payment Confirmed',
      message: `Your payment of ${amount} for ${serviceName} has been received. Ref: ${referenceNumber}`,
      recipientEmail: patient.email,
      recipientPhone: patient.phone,
    });

    await this.notificationsService.create({
      userId: patient.id,
      appointmentId: appt.id,
      notificationType: NotificationType.EMAIL,
      title: 'Payment Receipt — SHAMS',
      message: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;">✅ Payment Confirmed</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <h2>Hello ${patientName}!</h2>
            <p>Your payment has been successfully processed.</p>
            <div style="background:#fff;border-left:4px solid #10b981;padding:20px;margin:20px 0;">
              <p><strong>Reference:</strong> ${referenceNumber}</p>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Amount:</strong> ${amount}</p>
              <p><strong>Appointment:</strong> ${apptDate} at ${apptTime}</p>
              <p><strong>Status:</strong> CONFIRMED</p>
            </div>
            <p>Please keep this reference number for your records. Your appointment is now pending confirmation by our staff.</p>
          </div>
        </div>
      `,
      recipientEmail: patient.email,
      recipientPhone: patient.phone,
    });

    await this.notificationsService.create({
      userId: patient.id,
      appointmentId: appt.id,
      notificationType: NotificationType.SMS,
      title: 'Payment Receipt',
      message: `SHAMS: Payment of ${amount} received for ${serviceName} on ${apptDate}. Ref: ${referenceNumber}. Your appointment is awaiting confirmation.`,
      recipientEmail: patient.email,
      recipientPhone: patient.phone,
    });
  }

  async getByAppointment(appointmentId: number, userId: number, userRole: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { appointmentId },
      include: {
        ...PAYMENT_INCLUDE,
        transaction: true,
      },
    });

    if (!payment) throw new NotFoundException('No payment found for this appointment');

    if (userRole === 'PATIENT' && payment.patientId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return payment;
  }

  async findAll(filterDto: FilterPaymentDto, userId: number, userRole: string) {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (userRole === 'PATIENT') {
      where.patientId = userId;
    } else {
      if (filters.patientId) where.patientId = filters.patientId;
    }

    if (filters.status) where.status = filters.status;
    if (filters.method) where.method = filters.method;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: PAYMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransactions(filterDto: FilterPaymentDto) {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.status) where.status = filters.status;
    if (filters.method) where.paymentMethod = filters.method;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        include: TRANSACTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStats() {
    const [
      totalRevenue,
      pendingCount,
      completedCount,
      refundedCount,
      failedCount,
      revenueByMethod,
      recentTransactions,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'COMPLETED' },
      }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.count({ where: { status: 'REFUNDED' } }),
      this.prisma.payment.count({ where: { status: 'FAILED' } }),
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amount: true },
        _count: { id: true },
        where: { status: 'COMPLETED' },
      }),
      this.prisma.transaction.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: TRANSACTION_INCLUDE,
      }),
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = await this.prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', created_at) AS month,
        SUM(amount)::float AS revenue,
        COUNT(id)::int AS count
      FROM payments
      WHERE status = 'COMPLETED'
        AND created_at >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `;

    return {
      totalRevenue: Number(totalRevenue._sum.amount ?? 0),
      counts: {
        pending: pendingCount,
        completed: completedCount,
        refunded: refundedCount,
        failed: failedCount,
        total: pendingCount + completedCount + refundedCount + failedCount,
      },
      revenueByMethod,
      monthlyRevenue: monthlyData,
      recentTransactions,
    };
  }

  async refund(id: number, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        appointment: {
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        service: true,
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    const [updated] = await this.prisma.$transaction(async (tx) => {
      const up = await tx.payment.update({
        where: { id },
        data: { status: PaymentStatus.REFUNDED },
        include: PAYMENT_INCLUDE,
      });

      await tx.transaction.updateMany({
        where: { paymentId: id },
        data: {
          status: PaymentStatus.REFUNDED,
          resultDesc: dto.notes ?? 'Refund processed',
        },
      });

      return [up];
    });

    const patient = payment.appointment.patient;
    if (patient) {
      await this.notificationsService.create({
        userId: patient.id,
        appointmentId: payment.appointmentId,
        notificationType: NotificationType.IN_APP,
        title: '💰 Refund Processed',
        message: `A refund of KES ${Number(payment.amount).toLocaleString()} has been processed for your appointment.`,
        recipientEmail: patient.email,
        recipientPhone: patient.phone,
      });
    }

    return updated;
  }
}