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

  /**
   * Core sender
   * @param text The plain text version of the message (Save THIS to your database)
   * @param html The stylized HTML version for the email inbox
   */
  async sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to,
        subject,
        text, // Plain text version for non-HTML clients
        html, // Rich content
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
    
    // Clean string for DB
    const text = `Hello ${firstName}, your SHAMS verification code is: ${code}. This code expires in 15 minutes.`;

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
    await this.sendMail(email, subject, html, text);
  }

  // ─── Password reset ───────────────────────────────────────────────────────
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    firstName: string,
  ): Promise<void> {
    const resetLink = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    const subject = 'Reset Your Password - SHAMS';
    
    // Clean string for DB
    const text = `Hello ${firstName}, click the link to reset your password: ${resetLink}. Link expires in 1 hour.`;

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
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html, text);
  }

  // ─── Password reset success ───────────────────────────────────────────────
  async sendPasswordResetSuccessEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    const subject = 'Password Reset Successful - SHAMS';
    const text = `Hello ${firstName}, your password has been successfully reset. You can now log in.`;

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
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html, text);
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
    
    // Clean string for DB
    const text = `Hello ${appointmentDetails.patientName}, this is a reminder for your ${appointmentDetails.type} appointment with Dr. ${appointmentDetails.doctorName} on ${appointmentDetails.date} at ${appointmentDetails.time} at ${appointmentDetails.location}.`;

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
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </body>
      </html>
    `;
    await this.sendMail(email, subject, html, text);
  }

  // ─── Admin invite ─────────────────────────────────────────────────────────
  async sendInviteEmail(
    email: string,
    firstName: string,
    temporaryPassword: string,
    verificationCode: string,
    role: string,
  ): Promise<void> {
    const loginUrl = `${this.configService.get<string>('FRONTEND_URL')}/login`;
    const subject = `Welcome to SHAMS — Your ${role} Account Has Been Created`;

    // Clean string for DB
    const text = `Hello ${firstName}, your ${role} account has been created. Login at ${loginUrl} with Email: ${email}, Temp Password: ${temporaryPassword}. Verification Code: ${verificationCode}.`;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f3f4f6; }
        .wrapper { max-width: 620px; margin: 40px auto; padding: 0 16px 40px; }
        .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 36px 32px; text-align: center; color: white; }
        .body { padding: 32px; }
        .role-badge { display: inline-block; background: #ede9fe; color: #6d28d9; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; margin-bottom: 20px; }
        .info-box { background: #f9fafb; border-left: 4px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .code-box { background: #fff; border: 2px dashed #667eea; border-radius: 12px; padding: 20px; text-align: center; font-size: 36px; font-weight: 800; color: #667eea; margin: 8px 0 24px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-weight: 700; }
        .footer { text-align: center; padding: 20px 32px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="header"><h1>🏥 Welcome to SHAMS</h1></div>
          <div class="body">
            <h2>Hello, ${firstName}!</h2>
            <p>An account has been created for you by a SHAMS administrator.</p>
            <span class="role-badge">${role}</span>
            <div class="info-box">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temp Password:</strong> ${temporaryPassword}</p>
            </div>
            <p>Verification Code:</p>
            <div class="code-box">${verificationCode}</div>
            <div style="text-align:center;"><a href="${loginUrl}" class="btn">Login to SHAMS →</a></div>
          </div>
          <div class="footer"><p>&copy; ${new Date().getFullYear()} SHAMS. All rights reserved.</p></div>
        </div>
      </div>
    </body>
    </html>
  `;

    await this.sendMail(email, subject, html, text);
  }
}