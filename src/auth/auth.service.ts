import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JsonWebTokenError,
  TokenExpiredError,
  sign,
  verify,
} from 'jsonwebtoken';
import { PrismaService } from '../database/prisma.service';
import type { SocialAuthProfile } from './types/social-auth-profile';
import type {
  AuthTokens,
  AccessTokenClaims,
  RefreshTokenClaims,
} from './auth.types';
import {
  AUTH_CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
} from './auth.constants';
import {
  asProviderName,
  isLoopbackRedirect,
  normalizeEmail,
  normalizeUsername,
  randomOpaqueToken,
  sha256,
  usernameFromEmail,
} from './auth.utils';
import type { SsoProvider } from './dto/sso-provider';

interface SsoStateClaims {
  provider: SsoProvider;
  redirectUri: string;
  nonce: string;
  typ: 'sso_state';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience?: string;
  private readonly jwtExpiresInSeconds: number;
  private readonly googleSsoEnabled: boolean;
  private readonly discordSsoEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || '';
    this.jwtIssuer =
      this.configService.get<string>('JWT_ISSUER') || 'friendolls';
    this.jwtAudience = this.configService.get<string>('JWT_AUDIENCE');
    this.jwtExpiresInSeconds = Number(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS') || '3600',
    );
    this.googleSsoEnabled = this.isProviderConfigured('GOOGLE');
    this.discordSsoEnabled = this.isProviderConfigured('DISCORD');

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET must be configured');
    }
  }

  startSso(provider: SsoProvider, redirectUri: string): { state: string } {
    this.assertProviderEnabled(provider);

    if (!isLoopbackRedirect(redirectUri)) {
      throw new BadRequestException(
        'Desktop redirect URI must target localhost or 127.0.0.1',
      );
    }

    const state = sign(
      {
        provider,
        redirectUri,
        nonce: randomOpaqueToken(16),
        typ: 'sso_state',
      } satisfies SsoStateClaims,
      this.jwtSecret,
      {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        expiresIn: Math.floor(AUTH_CODE_TTL_MS / 1000),
        algorithm: 'HS256',
      },
    );

    return { state };
  }

  async completeSso(
    provider: SsoProvider,
    state: string,
    profile: SocialAuthProfile,
  ): Promise<string> {
    this.assertProviderEnabled(provider);

    const stateClaims = this.verifyStateToken(state, provider);
    const user = await this.findOrCreateUserFromProfile(profile);
    const authCode = randomOpaqueToken(32);

    await this.prisma.authExchangeCode.create({
      data: {
        provider: asProviderName(provider),
        codeHash: sha256(authCode),
        expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
        userId: user.id,
      },
    });

    const callbackUrl = new URL(stateClaims.redirectUri);
    callbackUrl.searchParams.set('code', authCode);
    callbackUrl.searchParams.set('state', state);
    return callbackUrl.toString();
  }

  async exchangeSsoCode(code: string): Promise<AuthTokens> {
    const codeHash = sha256(code);

    const matchedExchange = await this.consumeExchangeCode(codeHash);

    if (!matchedExchange) {
      throw new UnauthorizedException('Invalid or expired exchange code');
    }

    return this.issueTokens(
      matchedExchange.user_id,
      matchedExchange.email,
      matchedExchange.roles,
      matchedExchange.provider,
    );
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(refreshToken);
    const refreshTokenHash = sha256(refreshToken);
    const now = new Date();

    const session = await this.getSessionWithUser(payload.sid);

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revoked_at || session.expires_at <= now) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.refresh_token_hash !== refreshTokenHash) {
      await this.revokeSessionOnReplay(session.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRefreshToken = this.signRefreshToken(session.user_id, session.id);
    const updated = await this.rotateRefreshSession(
      session.id,
      refreshTokenHash,
      nextRefreshToken,
    );

    if (!updated) {
      await this.revokeSessionOnReplay(session.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: this.signAccessToken(
        session.user_id,
        session.email,
        session.roles,
      ),
      expiresIn: this.jwtExpiresInSeconds,
      refreshToken: nextRefreshToken,
      refreshExpiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      const updated = await this.revokeRefreshSession(
        payload.sid,
        sha256(refreshToken),
      );

      if (!updated) {
        return;
      }
    } catch {
      return;
    }
  }

  private async findOrCreateUserFromProfile(profile: SocialAuthProfile) {
    const provider = asProviderName(profile.provider);
    const now = new Date();
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider,
          providerSubject: profile.providerSubject,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingIdentity) {
      const normalizedProviderEmail = profile.email
        ? normalizeEmail(profile.email)
        : null;
      const resolvedUsername = await this.resolveUsername(
        profile.username,
        normalizedProviderEmail,
        existingIdentity.user.id,
      );

      await this.prisma.authIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          ...(normalizedProviderEmail
            ? { providerEmail: normalizedProviderEmail }
            : {}),
          providerName: profile.displayName,
          providerUsername: resolvedUsername,
          providerPicture: profile.picture,
          emailVerified: profile.emailVerified,
        },
      });

      const user = await this.prisma.user.update({
        where: { id: existingIdentity.user.id },
        data: {
          ...(normalizedProviderEmail
            ? { email: normalizedProviderEmail }
            : {}),
          name: profile.displayName,
          username: resolvedUsername,
          picture: profile.picture,
          lastLoginAt: now,
        },
      });

      return user;
    }

    if (!profile.email) {
      throw new BadRequestException('Provider did not supply an email address');
    }

    const email = normalizeEmail(profile.email);
    const resolvedUsername = await this.resolveUsername(
      profile.username,
      email,
    );

    if (!profile.emailVerified) {
      throw new BadRequestException(
        'Provider email must be verified before creating an account',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email },
      });

      if (user) {
        throw new BadRequestException(
          'An account with this email already exists. Sign in with the existing account before linking this provider.',
        );
      }

      user = await tx.user.create({
        data: {
          email,
          name: profile.displayName,
          username: resolvedUsername,
          picture: profile.picture,
          roles: [],
          lastLoginAt: now,
          keycloakSub: null,
        },
      });

      await tx.authIdentity.create({
        data: {
          provider,
          providerSubject: profile.providerSubject,
          providerEmail: email,
          providerName: profile.displayName,
          providerUsername: resolvedUsername,
          providerPicture: profile.picture,
          emailVerified: profile.emailVerified,
          userId: user.id,
        },
      });

      return user;
    });
  }

  private async resolveUsername(
    providerUsername: string | undefined,
    email: string | null,
    excludeUserId?: string,
  ): Promise<string> {
    const candidates = [
      providerUsername ? normalizeUsername(providerUsername) : '',
      email ? usernameFromEmail(email) : '',
      'friendoll',
    ].filter(
      (value, index, all) => value.length > 0 && all.indexOf(value) === index,
    );

    for (const base of candidates) {
      const available = await this.isUsernameAvailable(base, excludeUserId);
      if (available) {
        return base;
      }

      for (let suffix = 2; suffix < 10_000; suffix += 1) {
        const maxBaseLength = Math.max(1, 24 - suffix.toString().length);
        const candidate = `${base.slice(0, maxBaseLength)}${suffix}`;
        const available = await this.isUsernameAvailable(
          candidate,
          excludeUserId,
        );
        if (available) {
          return candidate;
        }
      }
    }

    throw new ServiceUnavailableException('Unable to assign a unique username');
  }

  private async isUsernameAvailable(
    username: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: {
        username,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: {
        id: true,
      },
    });

    return !existing;
  }

  private async issueTokens(
    userId: string,
    email: string,
    roles: string[],
    provider?: 'GOOGLE' | 'DISCORD',
  ): Promise<AuthTokens> {
    const sessionId = randomOpaqueToken(16);
    const refreshToken = this.signRefreshToken(userId, sessionId);

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        provider: provider ?? null,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        userId,
      },
    });

    return {
      accessToken: this.signAccessToken(userId, email, roles),
      expiresIn: this.jwtExpiresInSeconds,
      refreshToken,
      refreshExpiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    };
  }

  private signAccessToken(
    userId: string,
    email: string,
    roles: string[],
  ): string {
    return sign(
      {
        sub: userId,
        email,
        roles,
        typ: ACCESS_TOKEN_TYPE,
      } satisfies AccessTokenClaims,
      this.jwtSecret,
      {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        expiresIn: this.jwtExpiresInSeconds,
        algorithm: 'HS256',
      },
    );
  }

  private signRefreshToken(userId: string, sessionId: string): string {
    return sign(
      {
        sub: userId,
        sid: sessionId,
        jti: randomOpaqueToken(16),
        typ: REFRESH_TOKEN_TYPE,
      } satisfies RefreshTokenClaims,
      this.jwtSecret,
      {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
        algorithm: 'HS256',
      },
    );
  }

  private verifyStateToken(
    state: string,
    provider: SsoProvider,
  ): SsoStateClaims {
    let payload: SsoStateClaims;

    try {
      payload = verify(state, this.jwtSecret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        algorithms: ['HS256'],
      }) as SsoStateClaims;
    } catch (error) {
      if (
        error instanceof TokenExpiredError ||
        error instanceof JsonWebTokenError
      ) {
        throw new BadRequestException('Invalid SSO state');
      }

      throw error;
    }

    if (payload.typ !== 'sso_state' || payload.provider !== provider) {
      throw new BadRequestException('Invalid SSO state');
    }

    if (!isLoopbackRedirect(payload.redirectUri)) {
      throw new BadRequestException('Invalid SSO redirect URI');
    }

    return payload;
  }

  private verifyRefreshToken(refreshToken: string): RefreshTokenClaims {
    let payload: RefreshTokenClaims;

    try {
      payload = verify(refreshToken, this.jwtSecret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        algorithms: ['HS256'],
      }) as RefreshTokenClaims;
    } catch (error) {
      if (
        error instanceof TokenExpiredError ||
        error instanceof JsonWebTokenError
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      throw error;
    }

    if (
      payload.typ !== 'refresh' ||
      !payload.sid ||
      !payload.sub ||
      !payload.jti
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  private isProviderConfigured(provider: 'GOOGLE' | 'DISCORD'): boolean {
    return Boolean(
      this.configService.get<string>(`${provider}_CLIENT_ID`) &&
        this.configService.get<string>(`${provider}_CLIENT_SECRET`) &&
        this.configService.get<string>(`${provider}_CALLBACK_URL`),
    );
  }

  private assertProviderEnabled(provider: SsoProvider): void {
    const enabled =
      provider === 'google' ? this.googleSsoEnabled : this.discordSsoEnabled;

    if (!enabled) {
      this.logger.warn(`SSO provider is not configured: ${provider}`);
      throw new ServiceUnavailableException(
        `${provider} SSO is not configured`,
      );
    }
  }

  private async consumeExchangeCode(codeHash: string): Promise<{
    id: string;
    provider: 'GOOGLE' | 'DISCORD';
    user_id: string;
    email: string;
    roles: string[];
  } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        provider: 'GOOGLE' | 'DISCORD';
        user_id: string;
        email: string;
        roles: string[];
      }>
    >`
      UPDATE auth_exchange_codes AS aec
      SET consumed_at = NOW()
      FROM users AS u
      WHERE aec.user_id = u.id
        AND aec.code_hash = ${codeHash}
        AND aec.consumed_at IS NULL
        AND aec.expires_at > NOW()
      RETURNING aec.id, aec.provider, aec.user_id, u.email, u.roles
    `;

    return rows[0] ?? null;
  }

  private async getSessionWithUser(sessionId: string): Promise<{
    id: string;
    refresh_token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    provider: 'GOOGLE' | 'DISCORD' | null;
    user_id: string;
    email: string;
    roles: string[];
  } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        refresh_token_hash: string;
        expires_at: Date;
        revoked_at: Date | null;
        provider: 'GOOGLE' | 'DISCORD' | null;
        user_id: string;
        email: string;
        roles: string[];
      }>
    >`
      SELECT s.id, s.refresh_token_hash, s.expires_at, s.revoked_at, s.provider, s.user_id, u.email, u.roles
      FROM auth_sessions AS s
      INNER JOIN users AS u ON u.id = s.user_id
      WHERE s.id = ${sessionId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async rotateRefreshSession(
    sessionId: string,
    refreshTokenHash: string,
    nextRefreshToken: string,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE auth_sessions
      SET refresh_token_hash = ${sha256(nextRefreshToken)},
          expires_at = ${new Date(Date.now() + REFRESH_TOKEN_TTL_MS)},
          revoked_at = NULL,
          updated_at = NOW()
      WHERE id = ${sessionId}
        AND refresh_token_hash = ${refreshTokenHash}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING id
    `;

    return rows.length === 1;
  }

  private async revokeRefreshSession(
    sessionId: string,
    refreshTokenHash: string,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE auth_sessions
      SET revoked_at = NOW(),
          updated_at = NOW()
      WHERE id = ${sessionId}
        AND refresh_token_hash = ${refreshTokenHash}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING id
    `;

    return rows.length === 1;
  }

  private async revokeSessionOnReplay(sessionId: string): Promise<void> {
    await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE auth_sessions
      SET revoked_at = NOW(),
          updated_at = NOW()
      WHERE id = ${sessionId}
        AND revoked_at IS NULL
      RETURNING id
    `;
  }
}
