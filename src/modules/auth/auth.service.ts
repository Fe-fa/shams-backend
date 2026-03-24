import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateResetToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Send verification code to both email and SMS
   */
  private async sendVerificationNotifications(
    email: string,
    phone: string,
    code: string,
    firstName: string,
  ) {
    const [emailResult, smsResult] = await Promise.allSettled([
      this.mailService.sendVerificationEmail(email, code, firstName),
      this.smsService.sendVerificationCode(phone, code, firstName),
    ]);

    const emailSent = emailResult.status === 'fulfilled';
    const smsSent = smsResult.status === 'fulfilled';

    if (!emailSent) {
      console.error('Failed to send verification email:', emailResult);
    }

    if (!smsSent) {
      console.error('Failed to send verification SMS:', smsResult);
    }

    if (!emailSent && !smsSent) {
      throw new InternalServerErrorException(
        'Account created, but failed to send verification code by email and SMS',
      );
    }

    return { emailSent, smsSent };
  }
  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: registerDto.email }, { phone: registerDto.phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or phone already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        phone: registerDto.phone,
        hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: registerDto.role || 'PATIENT',
        verificationCode,
        verificationCodeExpiry,
        specialization: registerDto.specialization,
        licenseNumber: registerDto.licenseNumber,
        department: registerDto.department,
      },
    });

    const notifications = await this.sendVerificationNotifications(
      user.email,
      user.phone,
      verificationCode,
      user.firstName,
    );

    return {
      message:
        'Registration successful. Please check your email or SMS for the verification code.',
      userId: user.id,
      email: user.email,
      phone: user.phone,
      notifications,
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: verifyEmailDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    if (user.verificationCode !== verifyEmailDto.code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (
      user.verificationCodeExpiry &&
      user.verificationCodeExpiry < new Date()
    ) {
      throw new BadRequestException('Verification code expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationCodeExpiry: null,
      },
    });

    return {
      message: 'Email verified successfully',
    };
  }

  async resendVerificationCode(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode,
        verificationCodeExpiry,
      },
    });

    const notifications = await this.sendVerificationNotifications(
      user.email,
      user.phone,
      verificationCode,
      user.firstName,
    );

    return {
      message:
        'Verification code sent successfully to both email and SMS',
      notifications,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: loginDto.emailOrPhone },
          { phone: loginDto.emailOrPhone },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.hashedPassword,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    if (!user) {
      return {
        message: 'If the email exists, a reset link will be sent',
      };
    }

    const resetToken = this.generateResetToken();
    const resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry,
      },
    });

    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetToken,
      user.firstName,
    );

    return {
      message: 'If the email exists, a reset link will be sent',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: resetPasswordDto.token,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (
      user.resetPasswordExpiry &&
      user.resetPasswordExpiry < new Date()
    ) {
      throw new BadRequestException('Reset token has expired');
    }

    const hashedPassword = await bcrypt.hash(
      resetPasswordDto.newPassword,
      10,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    await this.mailService.sendPasswordResetSuccessEmail(
      user.email,
      user.firstName,
    );

    return {
      message: 'Password reset successfully',
    };
  }

  async validateUser(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isVerified: true,
      },
    });
  }
}
