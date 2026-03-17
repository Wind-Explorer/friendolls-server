import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from 'jsonwebtoken';
import type { JwtPayload } from '../strategies/jwt.strategy';

const JWT_ALGORITHM = 'HS256';
const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class JwtVerificationService {
  private readonly logger = new Logger(JwtVerificationService.name);
  private readonly jwtSecret: string;
  private readonly issuer: string;
  private readonly audience: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || '';
    this.issuer = this.configService.get<string>('JWT_ISSUER') || 'friendolls';
    this.audience = this.configService.get<string>('JWT_AUDIENCE');

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET must be configured');
    }

    this.logger.log('JWT Verification Service initialized');
  }

  verifyToken(token: string): JwtPayload {
    const payload = verify(token, this.jwtSecret, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: [JWT_ALGORITHM],
    }) as JwtPayload;

    if (payload.typ !== 'access') {
      throw new Error('Invalid token type');
    }

    return payload;
  }

  extractToken(handshake: {
    auth?: { token?: string };
    headers?: { authorization?: string };
  }): string | undefined {
    if (handshake.auth?.token) {
      return handshake.auth.token;
    }

    const authHeader = handshake.headers?.authorization;
    if (authHeader?.startsWith(BEARER_PREFIX)) {
      return authHeader.replace(BEARER_PREFIX, '');
    }

    return undefined;
  }
}
