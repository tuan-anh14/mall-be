import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { EmailModule } from '@/shared/email/email.module';
import { UserSessionRepository } from './repositories/user-session.repository';
import { USER_SESSION_REPOSITORY } from './repositories/user-session.repository.interface';
import { PasswordResetRepository } from './repositories/password-reset.repository';
import { PASSWORD_RESET_REPOSITORY } from './repositories/password-reset.repository.interface';
import { OAuthAccountRepository } from './repositories/oauth-account.repository';
import { OAUTH_ACCOUNT_REPOSITORY } from './repositories/oauth-account.repository.interface';

@Module({
  imports: [PassportModule, EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    GithubStrategy,
    { provide: USER_SESSION_REPOSITORY, useClass: UserSessionRepository },
    { provide: PASSWORD_RESET_REPOSITORY, useClass: PasswordResetRepository },
    { provide: OAUTH_ACCOUNT_REPOSITORY, useClass: OAuthAccountRepository },
  ],
  exports: [AuthService, USER_SESSION_REPOSITORY],
})
export class AuthModule {}
