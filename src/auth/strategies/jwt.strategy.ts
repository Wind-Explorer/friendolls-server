import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/**
 * JWT payload interface representing the decoded token
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  roles?: string[];
  iss: string;
  aud?: string;
  exp: number;
  iat: number;
}

/**
 * JWT Strategy for validating locally issued JWT tokens.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    const issuer = configService.get<string>('JWT_ISSUER') || 'friendolls';
    const audience = configService.get<string>('JWT_AUDIENCE');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET must be configured in environment variables');
    }

    super({
      // Extract JWT from Authorization header as Bearer token
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
      issuer,
      audience,
      ignoreExpiration: false,
      algorithms: ['HS256'],
    });

    this.logger.log(`JWT Strategy initialized`);
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
    userId: string;
    email: string;
    roles?: string[];
  }> {
    this.logger.debug(`Validating JWT token payload`);
    this.logger.debug(`  Issuer: ${payload.iss}`);
    if (payload.aud) {
      this.logger.debug(`  Audience: ${payload.aud}`);
    }
    this.logger.debug(`  Subject: ${payload.sub}`);
    this.logger.debug(
      `  Expires: ${new Date(payload.exp * 1000).toISOString()}`,
    );

    if (!payload.sub) {
      this.logger.warn('JWT token missing required "sub" claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    const user = {
      userId: payload.sub,
      email: payload.email,
      roles:
        payload.roles && payload.roles.length > 0 ? payload.roles : undefined,
    };

    this.logger.log(
      `✅ Successfully validated token for user: ${payload.sub} (${payload.email})`,
    );

    return Promise.resolve(user);
  }
}
