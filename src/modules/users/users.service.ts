import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  async adminCreateUser(createUserDto: CreateUserDto, creatorRole: string) {
    if (creatorRole === 'DOCTOR' && createUserDto.role !== 'PATIENT') {
      throw new ForbiddenException('Doctors can only create PATIENT accounts');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: createUserDto.email }, { phone: createUserDto.phone }],
      },
    });

    if (existing) {
      throw new ConflictException(
        'User with this email or phone already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    const verificationCodeExpiry = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    );

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        phone: createUserDto.phone,
        hashedPassword,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        role: createUserDto.role,
        specialization: createUserDto.specialization,
        licenseNumber: createUserDto.licenseNumber,
        department: createUserDto.department,
        verificationCode,
        verificationCodeExpiry,
        isActive: true,
        isVerified: false,
      },
    });

    let emailSent = false;
    let smsSent = false;

    const tasks: Promise<any>[] = [];
    const channels: ('email' | 'sms')[] = [];

    if (createUserDto.sendInviteEmail !== false) {
      tasks.push(
        this.mailService.sendInviteEmail(
          user.email,
          user.firstName,
          createUserDto.password,
          verificationCode,
          user.role,
        ),
      );
      channels.push('email');
    }

    tasks.push(
      this.smsService.sendInviteVerificationCode(user.phone, {
        firstName: user.firstName,
        code: verificationCode,
        role: user.role,
      }),
    );
    channels.push('sms');

    const results = await Promise.allSettled(tasks);

    results.forEach((result, index) => {
      const channel = channels[index];

      if (channel === 'email') {
        emailSent = result.status === 'fulfilled';
        if (result.status === 'rejected') {
          console.error('Failed to send invite email:', result.reason);
        }
      }

      if (channel === 'sms') {
        smsSent = result.status === 'fulfilled';
        if (result.status === 'rejected') {
          console.error('Failed to send invite SMS:', result.reason);
        }
      }
    });

    return {
      message: `${user.role} account created successfully`,
      userId: user.id,
      email: user.email,
      phone: user.phone,
      notifications: {
        emailSent,
        smsSent,
      },
    };
  }

  async findAll(role?: UserRole) {
    const where = role ? { role } : {};
    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isVerified: true,
        specialization: true,
        department: true,
        licenseNumber: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        address: true,
        role: true,
        isActive: true,
        isVerified: true,
        bloodType: true,
        allergies: true,
        medicalHistory: true,
        specialization: true,
        licenseNumber: true,
        department: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findDoctors(specialization?: string) {
    const where: any = { role: UserRole.DOCTOR, isActive: true };

    if (specialization) {
      where.specialization = {
        contains: specialization,
        mode: 'insensitive',
      };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        specialization: true,
        department: true,
      },
    });
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    currentUserId: number,
    currentUserRole: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (currentUserRole === 'PATIENT' && id !== currentUserId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    if (currentUserRole === 'DOCTOR' && id !== currentUserId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    if (updateUserDto.isActive !== undefined && currentUserRole !== 'ADMIN') {
      delete updateUserDto.isActive;
    }

    const updateData: any = { ...updateUserDto };

    if (updateUserDto.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateUserDto.dateOfBirth);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        address: true,
        role: true,
        isActive: true,
        bloodType: true,
        allergies: true,
        medicalHistory: true,
        specialization: true,
        department: true,
      },
    });
  }

  async remove(id: number, currentUserRole: string) {
    if (currentUserRole !== 'ADMIN') {
      throw new ForbiddenException('Only admins can delete users');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getProfile(userId: number) {
    return this.findOne(userId);
  }

  async getStats(userId: number, role: string) {
    if (role === 'PATIENT') {
      const [total, upcoming, completed, cancelled] = await Promise.all([
        this.prisma.appointment.count({ where: { patientId: userId } }),
        this.prisma.appointment.count({
          where: {
            patientId: userId,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            appointmentDate: { gte: new Date() },
          },
        }),
        this.prisma.appointment.count({
          where: { patientId: userId, status: 'COMPLETED' },
        }),
        this.prisma.appointment.count({
          where: { patientId: userId, status: 'CANCELLED' },
        }),
      ]);

      return { total, upcoming, completed, cancelled };
    }

    if (role === 'DOCTOR' || role === 'NURSE') {
      const [total, today, completed, pending] = await Promise.all([
        this.prisma.appointment.count({ where: { doctorId: userId } }),
        this.prisma.appointment.count({
          where: {
            doctorId: userId,
            appointmentDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        }),
        this.prisma.appointment.count({
          where: { doctorId: userId, status: 'COMPLETED' },
        }),
        this.prisma.appointment.count({
          where: {
            doctorId: userId,
            status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
          },
        }),
      ]);

      return { total, today, completed, pending };
    }

    return {};
  }
}
