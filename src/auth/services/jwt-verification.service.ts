import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify, type JwtHeader } from 'jsonwebtoken';
import { JwksClient, type SigningKey } from 'jwks-rsa';
import type { JwtPayload } from '../strategies/jwt.strategy';

const JWT_ALGORITHM = 'RS256';
const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class JwtVerificationService {
  private readonly logger = new Logger(JwtVerificationService.name);
  private readonly jwksClient: JwksClient;
  private readonly issuer: string;
  private readonly audience: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const jwksUri = this.configService.get<string>('JWKS_URI');
    this.issuer = this.configService.get<string>('JWT_ISSUER') || '';
    this.audience = this.configService.get<string>('JWT_AUDIENCE');

    if (!jwksUri) {
      throw new Error('JWKS_URI must be configured');
    }

    if (!this.issuer) {
      throw new Error('JWT_ISSUER must be configured');
    }

    this.jwksClient = new JwksClient({
      jwksUri,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
    });

    this.logger.log('JWT Verification Service initialized');
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      const getKey = (
        header: JwtHeader,
        callback: (err: Error | null, signingKey?: string | Buffer) => void,
      ) => {
        this.jwksClient.getSigningKey(
          header.kid,
          (err: Error | null, key?: SigningKey) => {
            if (err) {
              callback(err);
              return;
            }
            const signingKey = key?.getPublicKey();
            callback(null, signingKey);
          },
        );
      };

      verify(
        token,
        getKey,
        {
          issuer: this.issuer,
          audience: this.audience,
          algorithms: [JWT_ALGORITHM],
        },
        (err, decoded) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(decoded as JwtPayload);
        },
      );
    });
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
