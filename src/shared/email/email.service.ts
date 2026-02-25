import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('email.host'),
      port: this.configService.get<number>('email.port'),
      secure: this.configService.get<boolean>('email.secure'),
      auth: {
        user: this.configService.get<string>('email.user'),
        pass: this.configService.get<string>('email.pass'),
      },
    });
  }

  async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('frontendUrl');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.logger.debug(`Password reset link for ${to}: ${resetUrl}`);

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('email.from'),
        to,
        subject: 'Reset your password',
        html: `
          <p>You requested a password reset.</p>
          <p><a href="${resetUrl}">Click here to reset your password</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you did not request this, you can safely ignore this email.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}`, err);
    }
  }
}
