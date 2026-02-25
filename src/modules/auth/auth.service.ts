import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Request } from 'express';
import { PrismaService } from '@/database/prisma.service';
import { User, UserType } from 'generated/prisma/client';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthUserDto,
} from './dto/auth.dto';
import {
  IUserSessionRepository,
  USER_SESSION_REPOSITORY,
} from './repositories/user-session.repository.interface';
import {
  IPasswordResetRepository,
  PASSWORD_RESET_REPOSITORY,
} from './repositories/password-reset.repository.interface';
import {
  IOAuthAccountRepository,
  OAUTH_ACCOUNT_REPOSITORY,
} from './repositories/oauth-account.repository.interface';

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_SESSION_REPOSITORY)
    private readonly userSessionRepository: IUserSessionRepository,
    @Inject(PASSWORD_RESET_REPOSITORY)
    private readonly passwordResetRepository: IPasswordResetRepository,
    @Inject(OAUTH_ACCOUNT_REPOSITORY)
    private readonly oAuthAccountRepository: IOAuthAccountRepository,
  ) {}

  buildUserResponse(user: User): AuthUserDto {
    return {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      userType: user.userType === UserType.SELLER ? 'seller' : 'buyer',
    };
  }

  private getDeviceName(req: Request): string {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('Chrome')) return 'Chrome Browser';
    if (ua.includes('Firefox')) return 'Firefox Browser';
    if (ua.includes('Safari')) return 'Safari Browser';
    return ua.slice(0, 100) || 'Unknown Device';
  }

  async createSession(userId: string, req: Request): Promise<string> {
    const session = await this.userSessionRepository.create({
      userId,
      deviceName: this.getDeviceName(req),
      userAgent: req.headers['user-agent']?.slice(0, 255),
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + this.SESSION_TTL_MS),
      isActive: true,
    });
    return session.id;
  }

  async register(
    dto: RegisterDto,
    req: Request,
  ): Promise<{ user: AuthUserDto; sessionId: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already exists');

    const [hashedPassword, nameParts] = await Promise.all([
      bcrypt.hash(dto.password, this.SALT_ROUNDS),
      Promise.resolve(dto.name.trim().split(/\s+/)),
    ]);

    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    const userType =
      dto.userType === 'seller' ? UserType.SELLER : UserType.BUYER;

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName,
          lastName,
          userType,
        },
      });

      if (userType === UserType.SELLER) {
        const base = dto.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 30);
        await tx.sellerProfile.create({
          data: {
            userId: newUser.id,
            storeName: `${dto.name}'s Store`,
            storeSlug: `${base}-${newUser.id.slice(-8)}`,
          },
        });
      }

      return newUser;
    });

    const sessionId = await this.createSession(user.id, req);
    return { user: this.buildUserResponse(user), sessionId };
  }

  async login(
    dto: LoginDto,
    req: Request,
  ): Promise<{ user: AuthUserDto; sessionId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(dto.password, user.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionId = await this.createSession(user.id, req);
    return { user: this.buildUserResponse(user), sessionId };
  }

  async logout(sessionId: string): Promise<void> {
    await this.userSessionRepository.deleteMany({ id: sessionId });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (!user) return null;

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.passwordResetRepository.create({
      userId: user.id,
      token: rawToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return rawToken;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const reset = await this.passwordResetRepository.findByToken(dto.token);

    if (!reset || reset.isUsed || reset.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { isUsed: true },
      }),
      this.prisma.userSession.deleteMany({
        where: { userId: reset.userId },
      }),
    ]);
  }

  async handleOAuthCallback(
    profile: OAuthProfile,
    req: Request,
  ): Promise<{ user: AuthUserDto; sessionId: string }> {
    const {
      provider,
      providerAccountId,
      email,
      firstName,
      lastName,
      avatar,
      accessToken,
      refreshToken,
    } = profile;

    const existingOAuth = await this.oAuthAccountRepository.findByProvider(
      provider,
      providerAccountId,
    );

    let user: User;

    if (existingOAuth) {
      user = existingOAuth.user;
      await this.oAuthAccountRepository.update(existingOAuth.id, {
        accessToken,
        refreshToken,
      });
    } else {
      user = await this.prisma.$transaction(async (tx) => {
        let existingUser = await tx.user.findUnique({ where: { email } });

        if (!existingUser) {
          existingUser = await tx.user.create({
            data: {
              email,
              firstName: firstName || 'User',
              lastName: lastName || '',
              userType: UserType.BUYER,
              avatar,
            },
          });
        }

        await tx.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider,
            providerAccountId,
            accessToken,
            refreshToken,
          },
        });

        return existingUser;
      });
    }

    const sessionId = await this.createSession(user.id, req);
    return { user: this.buildUserResponse(user), sessionId };
  }
}
