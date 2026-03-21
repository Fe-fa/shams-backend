import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  // ─── Template loader ──────────────────────────────────────────────────────
  private async loadTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const templatePath = path.join(
      __dirname,
      'templates',
      `${templateName}.hbs`,
    );
    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);
    return template(context);
  }

  // ─── Core sender ──────────────────────────────────────────────────────────
  async sendMail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to,
        subject,
        html,
      });
      console.log(`✅ Email sent to ${to}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  // ─── Verification ─────────────────────────────────────────────────────────
  async sendVerificationEmail(
    email: string,
    code: string,
    firstName: string,
  ): Promise<void> {
    const subject = 'Verify Your Email - SHAMS';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .code { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #667eea; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🏥 Welcome to SHAMS</h1></div>
          <div class="content">
            <h2>Hello ${firstName}!</h2>
            <p>Thank you for registering with Smart Healthcare Appointment Management System.</p>
            <p>To complete your registration, please use the verification code below:</p>
            <div class="code">${code}</div>
            <p><strong>This code will expire in 15 minutes.</strong></p>
            <p>If you didn't create an account, please ignore this email.</p>
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html);
  }

  // ─── Password reset ───────────────────────────────────────────────────────
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    firstName: string,
  ): Promise<void> {
    const resetLink = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    const subject = 'Reset Your Password - SHAMS';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🔐 Password Reset Request</h1></div>
          <div class="content">
            <h2>Hello ${firstName},</h2>
            <p>We received a request to reset your password for your SHAMS account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetLink}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, please ignore this email.</p>
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html);
  }

  // ─── Password reset success ───────────────────────────────────────────────
  async sendPasswordResetSuccessEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    const subject = 'Password Reset Successful - SHAMS';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>✅ Password Reset Successful</h1></div>
          <div class="content">
            <h2>Hello ${firstName},</h2>
            <p>Your password has been successfully reset.</p>
            <p>You can now log in to your SHAMS account using your new password.</p>
            <p>If you didn't make this change, please contact our support team immediately.</p>
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html);
  }

  // ─── Appointment reminder ─────────────────────────────────────────────────
  async sendAppointmentReminderEmail(
    email: string,
    appointmentDetails: {
      patientName: string;
      doctorName: string;
      date: string;
      time: string;
      type: string;
      location: string;
    },
  ): Promise<void> {
    const subject = 'Appointment Reminder - SHAMS';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .appointment-box { background: white; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>📅 Appointment Reminder</h1></div>
          <div class="content">
            <h2>Hello ${appointmentDetails.patientName}!</h2>
            <p>This is a reminder for your upcoming appointment:</p>
            <div class="appointment-box">
              <p><strong>Doctor:</strong> ${appointmentDetails.doctorName}</p>
              <p><strong>Date:</strong> ${appointmentDetails.date}</p>
              <p><strong>Time:</strong> ${appointmentDetails.time}</p>
              <p><strong>Type:</strong> ${appointmentDetails.type}</p>
              <p><strong>Location:</strong> ${appointmentDetails.location}</p>
            </div>
            <p>Please arrive 15 minutes early to complete check-in procedures.</p>
            <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html);
  }

  // ─── Admin invite (uses invite.hbs template) ──────────────────────────────
  // async sendInviteEmail(
  //   email: string,
  //   firstName: string,
  //   temporaryPassword: string,
  //   verificationCode: string,
  //   role: string,
  // ): Promise<void> {
  //   const loginUrl = `${this.configService.get<string>('FRONTEND_URL')}/login`;
  //   const subject = `Welcome to SHAMS — Your ${role} Account Has Been Created`;

  //   const html = await this.loadTemplate('invite', {
  //     firstName,
  //     role,
  //     email,
  //     password: temporaryPassword,
  //     verificationCode,
  //     loginUrl,
  //     year: new Date().getFullYear(),
  //   });

  //   await this.sendMail(email, subject, html);
  // }

  async sendInviteEmail(
    email: string,
    firstName: string,
    temporaryPassword: string,
    verificationCode: string,
    role: string,
  ): Promise<void> {
    const loginUrl = `${this.configService.get<string>('FRONTEND_URL')}/login`;
    const subject = `Welcome to SHAMS — Your ${role} Account Has Been Created`;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f3f4f6; }
        .wrapper { max-width: 620px; margin: 40px auto; padding: 0 16px 40px; }
        .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 36px 32px; text-align: center; }
        .header h1 { color: #fff; font-size: 24px; font-weight: 700; margin: 0; }
        .header p { color: rgba(255,255,255,.8); font-size: 14px; margin: 6px 0 0; }
        .body { padding: 32px; }
        .body h2 { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
        .body p { color: #4b5563; font-size: 15px; margin-bottom: 12px; }
        .role-badge { display: inline-block; background: #ede9fe; color: #6d28d9; font-size: 12px; font-weight: 700; letter-spacing: .5px; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; margin-bottom: 20px; }
        .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .info-row { display: flex; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #6b7280; font-weight: 600; width: 48%; }
        .info-value { color: #111827; font-weight: 700; word-break: break-all; }
        .code-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
        .code-box { background: #fff; border: 2px dashed #667eea; border-radius: 12px; padding: 20px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #667eea; margin: 8px 0 24px; }
        .btn-wrap { text-align: center; margin: 24px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 15px; font-weight: 700; }
        .warning { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #92400e; margin-top: 20px; }
        .footer { text-align: center; padding: 20px 32px; border-top: 1px solid #f3f4f6; }
        .footer p { font-size: 12px; color: #9ca3af; margin: 0; }
        .footer a { color: #667eea; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="header">
            <h1>🏥 Welcome to SHAMS</h1>
            <p>Smart Healthcare Appointment Management System</p>
          </div>
          <div class="body">
            <h2>Hello, ${firstName}!</h2>
            <p>An account has been created for you by a SHAMS administrator. You can now log in and start using the platform.</p>
            <span class="role-badge">${role}</span>
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Email (username)</span>
                <span class="info-value">${email}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Temporary Password</span>
                <span class="info-value">${temporaryPassword}</span>
              </div>
            </div>
            <p class="code-label">Use this code to verify your account after first login:</p>
            <div class="code-box">${verificationCode}</div>
            <div class="btn-wrap">
              <a href="${loginUrl}" class="btn">Login to SHAMS →</a>
            </div>
            <div class="warning">
              <strong>⚠️ Security reminder:</strong> This is a temporary password.
              Please change it immediately after your first login.
              Do not share your credentials with anyone.
            </div>
          </div>
          <div class="footer">
            <p>You received this email because an administrator created an account for you on SHAMS.</p>
            <p style="margin-top:8px">&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

    await this.sendMail(email, subject, html);
  }
}
