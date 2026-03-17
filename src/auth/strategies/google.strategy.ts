import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import type { SocialAuthProfile } from '../types/social-auth-profile';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID') || '';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET') || '';
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL') || '';

    if (!clientID || !clientSecret || !callbackURL) {
      super({
        clientID: 'disabled',
        clientSecret: 'disabled',
        callbackURL: 'http://localhost/disabled',
      });
      this.logger.warn(
        'Google OAuth strategy disabled: configuration incomplete',
      );
      return;
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['openid', 'email', 'profile'],
      passReqToCallback: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: SocialAuthProfile) => void,
  ): void {
    const primaryEmail =
      profile.emails?.find((item) => item.value)?.value ?? null;
    const emailVerified =
      profile.emails?.find((item) => item.verified)?.verified ?? false;
    const user: SocialAuthProfile = {
      provider: 'google',
      providerSubject: profile.id,
      email: primaryEmail,
      emailVerified,
      displayName: profile.displayName || profile.username || 'Google User',
      username: profile.username,
      picture: profile.photos?.[0]?.value,
    };

    done(null, user);
  }
}
