import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsGateway } from './notifications.gateway';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private smsService: SmsService,
    private gateway: NotificationsGateway,
  ) {}

  // ─── Create & send immediately ────────────────────────────────────────────
  async create(createNotificationDto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: createNotificationDto,
    });
    // Fire and forget — don't await to avoid blocking callers
    this.send(notification.id).catch((err) =>
      console.error(`Notification send failed (id=${notification.id}):`, err),
    );
    return notification;
  }

  // ─── Send by id ───────────────────────────────────────────────────────────
  async send(id: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    try {
      switch (notification.notificationType) {
        // ── EMAIL ────────────────────────────────────────────────────────────
        case 'EMAIL': {
          if (notification.recipientEmail) {
            await this.mailService.sendMail(
              notification.recipientEmail,
              notification.title,
              notification.message,
            );
          }
          break;
        }

        // ── SMS ──────────────────────────────────────────────────────────────
        case 'SMS': {
          if (notification.recipientPhone) {
            await this.smsService.sendSms(
              notification.recipientPhone,
              notification.message,
            );
          }
          break;
        }

        // ── IN-APP (WebSocket) ────────────────────────────────────────────
        case 'IN_APP': {
          this.gateway.sendNotification(notification.userId, {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            appointmentId: notification.appointmentId,
            isRead: false,
            createdAt: notification.createdAt,
            priority: notification.priority,
          });
          break;
        }
      }

      await this.prisma.notification.update({
        where: { id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
          errorMessage: error?.message ?? 'Unknown error',
          retryCount: notification.retryCount + 1,
        },
      });
      throw error;
    }
  }

  // ─── Bulk notify (helper for appointments service) ────────────────────────
  async notifyAll(
    userId: number,
    appointmentId: number | undefined,
    opts: {
      title: string;
      inApp: string;
      email: string;
      sms: string;
      recipientEmail: string;
      recipientPhone: string;
    },
  ) {
    await Promise.allSettled([
      this.create({
        userId,
        appointmentId,
        notificationType: 'IN_APP',
        title: opts.title,
        message: opts.inApp,
        recipientEmail: opts.recipientEmail,
        recipientPhone: opts.recipientPhone,
      }),
      this.create({
        userId,
        appointmentId,
        notificationType: 'EMAIL',
        title: opts.title,
        message: opts.email,
        recipientEmail: opts.recipientEmail,
        recipientPhone: opts.recipientPhone,
      }),
      this.create({
        userId,
        appointmentId,
        notificationType: 'SMS',
        title: opts.title,
        message: opts.sms,
        recipientEmail: opts.recipientEmail,
        recipientPhone: opts.recipientPhone,
      }),
    ]);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────
  async findAll(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUnread(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false, notificationType: 'IN_APP' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: number, userId: number) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false, notificationType: 'IN_APP' },
    });
  }
}