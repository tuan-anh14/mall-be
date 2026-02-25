import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { OAuthProfile } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService) {
    super({
      clientID:
        configService.get<string>('oauth.github.clientId') ||
        'UNCONFIGURED_GITHUB_CLIENT_ID',
      clientSecret:
        configService.get<string>('oauth.github.clientSecret') ||
        'UNCONFIGURED_GITHUB_CLIENT_SECRET',
      callbackURL: `${configService.get<string>('url')}/api/v1/auth/github/callback`,
      scope: ['user:email'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: unknown, user?: OAuthProfile) => void,
  ): void {
    const { id, emails, displayName, photos } = profile;
    const nameParts = (displayName || '').trim().split(/\s+/);

    const oauthProfile: OAuthProfile = {
      provider: 'github',
      providerAccountId: id,
      email: emails?.[0]?.value || '',
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      avatar: photos?.[0]?.value,
      accessToken,
      refreshToken,
    };

    done(null, oauthProfile);
  }
}
