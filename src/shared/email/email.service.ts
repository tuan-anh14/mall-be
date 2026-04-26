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

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    const from = this.configService.get<string>('email.from');

    this.logger.debug(`Sending verification code ${code} to ${to}`);

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Xác thực tài khoản Shop HUB',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1a202c;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Shop <span style="color: #1e3a8a;">HUB</span></h1>
            </div>
            <h2 style="color: #2d3748; text-align: center; margin-bottom: 24px; font-size: 20px; font-weight: 600;">Chào mừng bạn đến với Shop HUB!</h2>
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Cảm ơn bạn đã đăng ký tài khoản. Vui lòng sử dụng mã dưới đây để xác thực địa chỉ email của mình:</p>
            <div style="background-color: #f8fafc; padding: 24px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #2563eb; margin: 24px 0; border-radius: 12px; border: 2px dashed #cbd5e1;">
              ${code}
            </div>
            <p style="color: #ef4444; font-size: 14px; font-weight: 500; text-align: center; margin-bottom: 32px;">⚠️ Mã này sẽ hết hạn sau 10 phút.</p>
            <p style="color: #718096; font-size: 14px; line-height: 1.5; text-align: center;">Nếu bạn không thực hiện yêu cầu này, bạn có thể an tâm bỏ qua email này.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0;">&copy; 2026 Shop HUB. Premium Shopping Experience.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err);
    }
  }

  async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('frontendUrl') || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    const from = this.configService.get<string>('email.from');

    this.logger.debug(`Password reset link for ${to}: ${resetUrl}`);

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Đặt lại mật khẩu Shop HUB',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1a202c;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Shop <span style="color: #1e3a8a;">HUB</span></h1>
            </div>
            <h2 style="color: #2d3748; text-align: center; margin-bottom: 24px; font-size: 20px; font-weight: 600;">Yêu cầu đặt lại mật khẩu</h2>
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng nhấn vào nút bên dưới để tiếp tục:</p>
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; transition: background-color 0.2s;">Đặt lại mật khẩu</a>
            </div>
            <p style="color: #718096; font-size: 14px; margin-top: 32px;">Hoặc sao chép đường dẫn này vào trình duyệt:</p>
            <p style="word-break: break-all; color: #2563eb; font-size: 12px; background-color: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${resetUrl}</p>
            <p style="color: #ef4444; font-size: 14px; font-weight: 500; margin-top: 24px;">⚠️ Liên kết này sẽ hết hạn sau 1 giờ.</p>
            <p style="color: #718096; font-size: 14px; margin-top: 24px;">Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể an tâm bỏ qua email này.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0;">&copy; 2026 Shop HUB. Premium Shopping Experience.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}`, err);
    }
  }

  async sendContactReplyEmail(
    to: string,
    userName: string,
    subject: string,
    originalMessage: string,
    replyText: string,
    attachments?: string[],
  ): Promise<void> {
    const from = this.configService.get<string>('email.from');

    const attachmentHtml = attachments?.length
      ? `
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #edf2f7;">
          <p style="font-size: 14px; font-weight: 600; color: #4a5568; margin-bottom: 12px;">Hình ảnh đính kèm:</p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${attachments.map(url => `<img src="${url}" style="width: 120px; hieght: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;" />`).join('')}
          </div>
        </div>
      ` : '';

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Re: ${subject} - Shop HUB Support`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1a202c;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Shop <span style="color: #1e3a8a;">HUB</span></h1>
            </div>
            
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Chào <strong>${userName}</strong>,</p>
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Cảm ơn bạn đã liên hệ với Shop HUB. Đây là phản hồi từ đội ngũ hỗ trợ của chúng tôi:</p>
            
            <div style="background-color: #f0f7ff; padding: 24px; border-radius: 12px; border-left: 4px solid #2563eb; color: #1e3a8a; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
              ${replyText.replace(/\n/g, '<br>')}
              ${attachmentHtml}
            </div>
            
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
              <p style="font-size: 14px; font-weight: 700; color: #718096; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Chi tiết yêu cầu của bạn:</p>
              <p style="margin: 0; font-size: 14px; color: #4a5568;"><strong>Chủ đề:</strong> ${subject}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;">
              <p style="margin: 0; font-size: 14px; color: #718096; font-style: italic;">"${originalMessage}"</p>
            </div>
            
            <p style="color: #718096; font-size: 14px; line-height: 1.5; margin-top: 32px; text-align: center;">Nếu bạn có thêm bất kỳ câu hỏi nào, vui lòng trả lời trực tiếp email này hoặc liên hệ lại với chúng tôi qua website.</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
            <p style="font-size: 12px; color: #a0aec0; text-align: center; margin: 0;">&copy; 2026 Shop HUB. Premium Shopping Experience.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send contact reply email to ${to}`, err);
    }
  }
}
