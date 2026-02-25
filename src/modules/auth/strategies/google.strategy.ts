import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { OAuthProfile } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID:
        configService.get<string>('oauth.google.clientId') ||
        'UNCONFIGURED_GOOGLE_CLIENT_ID',
      clientSecret:
        configService.get<string>('oauth.google.clientSecret') ||
        'UNCONFIGURED_GOOGLE_CLIENT_SECRET',
      callbackURL: `${configService.get<string>('url')}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const { id, emails, name, photos } = profile;

    const oauthProfile: OAuthProfile = {
      provider: 'google',
      providerAccountId: id,
      email: emails?.[0]?.value || '',
      firstName: name?.givenName || '',
      lastName: name?.familyName || '',
      avatar: photos?.[0]?.value,
      accessToken,
      refreshToken,
    };

    done(null, oauthProfile);
  }
}
