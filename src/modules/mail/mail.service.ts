import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(email: string, code: string) {
    const mailOptions = {
      from: `"Shop MALL" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Xác thực tài khoản Shop MALL',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #2563eb; text-align: center; margin-bottom: 24px;">Chào mừng bạn đến với Shop MALL!</h2>
          <p style="color: #374151; font-size: 16px; line-height: 1.5;">Cảm ơn bạn đã đăng ký tài khoản. Vui lòng sử dụng mã dưới đây để xác thực email của mình:</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1f2937; margin: 24px 0; border-radius: 8px; border: 1px dashed #2563eb;">
            ${code}
          </div>
          <p style="color: #ef4444; font-size: 14px; font-weight: 500;">Mã này sẽ hết hạn sau 10 phút.</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">&copy; 2026 Shop MALL. Hệ thống mua sắm trực tuyến cao cấp.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw error;
    }
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"Shop MALL" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Đặt lại mật khẩu Shop MALL',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #2563eb; text-align: center; margin-bottom: 24px;">Yêu cầu đặt lại mật khẩu</h2>
          <p style="color: #374151; font-size: 16px; line-height: 1.5;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng nhấn vào nút bên dưới để tiếp tục:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Đặt lại mật khẩu</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Hoặc sao chép link này vào trình duyệt:</p>
          <p style="word-break: break-all; color: #2563eb; font-size: 12px; background-color: #f9fafb; padding: 10px; border-radius: 4px;">${resetLink}</p>
          <p style="color: #ef4444; font-size: 14px; font-weight: 500; margin-top: 16px;">Link này sẽ hết hạn sau 1 giờ.</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">&copy; 2026 Shop MALL. Hệ thống mua sắm trực tuyến cao cấp.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending reset password email:', error);
      throw error;
    }
  }
}
