import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

import { passportJwtSecret } from 'jwks-rsa';

/**
 * JWT payload interface representing the decoded token from Keycloak
 */
export interface JwtPayload {
  sub: string; // Subject (user identifier in Keycloak)
  email?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  iss: string; // Issuer
  aud: string | string[]; // Audience
  exp: number; // Expiration time
  iat: number; // Issued at
}

/**
 * JWT Strategy for validating Keycloak-issued JWT tokens.
 * This strategy validates tokens against Keycloak's public keys (JWKS)
 * and extracts user information from the token payload.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private configService: ConfigService) {
    const jwksUri = configService.get<string>('JWKS_URI');
    const issuer = configService.get<string>('JWT_ISSUER');
    const audience = configService.get<string>('JWT_AUDIENCE');

    if (!jwksUri) {
      throw new Error('JWKS_URI must be configured in environment variables');
    }

    if (!issuer) {
      throw new Error('JWT_ISSUER must be configured in environment variables');
    }

    super({
      // Extract JWT from Authorization header as Bearer token
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // Use JWKS to fetch and cache Keycloak's public keys for signature verification
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      }),

      // Verify the issuer matches our Keycloak realm
      issuer,

      // Verify the audience matches our client ID
      audience,

      // Automatically reject expired tokens
      ignoreExpiration: false,

      // Use RS256 algorithm (Keycloak's default)
      algorithms: ['RS256'],
    });

    this.logger.log(`JWT Strategy initialized`);
    this.logger.log(`  JWKS URI: ${jwksUri}`);
    this.logger.log(`  Issuer: ${issuer}`);
    this.logger.log(`  Audience: ${audience || 'NOT SET'}`);
  }

  /**
   * Validates the JWT payload after signature verification.
   * This method is called automatically by Passport after the token is verified.
   *
   * @param payload - The decoded JWT payload
   * @returns The validated user object to be attached to the request
   * @throws UnauthorizedException if the payload is invalid
   */
  async validate(payload: JwtPayload): Promise<{
    keycloakSub: string;
    email?: string;
    name?: string;
    username?: string;
    picture?: string;
    roles?: string[];
  }> {
    this.logger.debug(`Validating JWT token payload`);
    this.logger.debug(`  Issuer: ${payload.iss}`);
    this.logger.debug(
      `  Audience: ${Array.isArray(payload.aud) ? payload.aud.join(',') : payload.aud}`,
    );
    this.logger.debug(`  Subject: ${payload.sub}`);
    this.logger.debug(
      `  Expires: ${new Date(payload.exp * 1000).toISOString()}`,
    );

    if (!payload.sub) {
      this.logger.warn('JWT token missing required "sub" claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // Extract roles from Keycloak's realm_access and resource_access
    const roles: string[] = [];

    if (payload.realm_access?.roles) {
      roles.push(...payload.realm_access.roles);
    }

    const clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID');
    if (clientId && payload.resource_access?.[clientId]?.roles) {
      roles.push(...payload.resource_access[clientId].roles);
    }

    // Return user object that will be attached to request.user
    const user = {
      keycloakSub: payload.sub,
      email: payload.email,
      name: payload.name,
      username: payload.preferred_username,
      picture: payload.picture,
      roles: roles.length > 0 ? roles : undefined,
    };

    this.logger.log(
      `✅ Successfully validated token for user: ${payload.sub} (${payload.email ?? payload.preferred_username ?? 'no email'})`,
    );

    return Promise.resolve(user);
  }
}
