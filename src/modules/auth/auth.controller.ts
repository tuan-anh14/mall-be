import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService, OAuthProfile } from './auth.service';
import { EmailService } from '@/shared/email/email.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthUserDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from '../../common/constants/routes.constant';
import { User } from 'generated/prisma/client';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  };

  constructor(
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiConflictResponse({ description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUserDto }> {
    const { user, sessionId } = await this.authService.register(dto, req);
    res.cookie(SESSION_COOKIE, sessionId, this.cookieOptions);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login' })
  @ApiResponse({ status: 200, description: 'Logged in successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUserDto }> {
    const { user, sessionId } = await this.authService.login(dto, req);
    res.cookie(SESSION_COOKIE, sessionId, this.cookieOptions);
    return { user };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'Current user info' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  me(@Req() req: Request): { user: AuthUserDto } {
    return { user: this.authService.buildUserResponse(req.user as User) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
    res.clearCookie(SESSION_COOKIE, { sameSite: 'lax', httpOnly: true });
    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Reset email sent (if email exists)',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const rawToken = await this.authService.forgotPassword(dto);
    if (rawToken) {
      await this.emailService.sendPasswordResetEmail(dto.email, rawToken);
    }
    return { message: 'If this email exists, a reset link has been sent.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiBadRequestResponse({ description: 'Invalid or expired reset token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth' })
  googleAuth(): void {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { sessionId } = await this.authService.handleOAuthCallback(
      req.user as OAuthProfile,
      req,
    );
    res.cookie(SESSION_COOKIE, sessionId, this.cookieOptions);
    res.redirect(`${this.configService.get<string>('frontendUrl')}/`);
  }

  // ─── GitHub OAuth ───────────────────────────────────────────────────────────

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth' })
  githubAuth(): void {}

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { sessionId } = await this.authService.handleOAuthCallback(
      req.user as OAuthProfile,
      req,
    );
    res.cookie(SESSION_COOKIE, sessionId, this.cookieOptions);
    res.redirect(`${this.configService.get<string>('frontendUrl')}/`);
  }
}
