import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-discord';
import type { SocialAuthProfile } from '../types/social-auth-profile';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  private readonly logger = new Logger(DiscordStrategy.name);

  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('DISCORD_CLIENT_ID') || '';
    const clientSecret =
      configService.get<string>('DISCORD_CLIENT_SECRET') || '';
    const callbackURL = configService.get<string>('DISCORD_CALLBACK_URL') || '';

    if (!clientID || !clientSecret || !callbackURL) {
      super({
        clientID: 'disabled',
        clientSecret: 'disabled',
        callbackURL: 'http://localhost/disabled',
        scope: ['identify'],
      });
      this.logger.warn(
        'Discord OAuth strategy disabled: configuration incomplete',
      );
      return;
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['identify', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: SocialAuthProfile) => void,
  ): void {
    const primaryEmail = profile.email ?? null;
    const user: SocialAuthProfile = {
      provider: 'discord',
      providerSubject: profile.id,
      email: primaryEmail,
      emailVerified: Boolean(
        (profile as Profile & { verified?: boolean }).verified,
      ),
      displayName: profile.username || profile.global_name || 'Discord User',
      username: profile.username,
      picture: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : undefined,
    };

    done(null, user);
  }
}
