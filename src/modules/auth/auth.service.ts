import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateResetToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  async register(registerDto: RegisterDto) {
    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: registerDto.email }, { phone: registerDto.phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or phone already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Generate verification code
    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create user
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

    // Send verification email
    await this.mailService.sendVerificationEmail(user.email, verificationCode, user.firstName);

    return {
      message: 'Registration successful. Please check your email for verification code.',
      userId: user.id,
      email: user.email,
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

    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code expired');
    }

    // Update user
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

    await this.mailService.sendVerificationEmail(user.email, verificationCode, user.firstName);

    return {
      message: 'Verification code sent successfully',
    };
  }

  async login(loginDto: LoginDto) {
    // Find user by email or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: loginDto.emailOrPhone }, { phone: loginDto.emailOrPhone }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.hashedPassword);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Generate JWT token
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
      // Don't reveal if email exists
      return {
        message: 'If the email exists, a reset link will be sent',
      };
    }

    const resetToken = this.generateResetToken();
    const resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry,
      },
    });

    await this.mailService.sendPasswordResetEmail(user.email, resetToken, user.firstName);

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

    if (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    await this.mailService.sendPasswordResetSuccessEmail(user.email, user.firstName);

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