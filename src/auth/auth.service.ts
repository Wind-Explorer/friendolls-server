import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'jsonwebtoken';
import { compare, hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User } from '../users/users.entity';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

/**
 * Authentication Service
 *
 * Handles native authentication:
 * - User registration
 * - Login with email/password
 * - JWT issuance
 * - Password changes
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience?: string;
  private readonly jwtExpiresInSeconds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || '';
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET must be configured');
    }
    this.jwtIssuer =
      this.configService.get<string>('JWT_ISSUER') || 'friendolls';
    this.jwtAudience = this.configService.get<string>('JWT_AUDIENCE');
    this.jwtExpiresInSeconds = Number(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS') || '3600',
    );
  }

  async register(data: {
    email: string;
    password: string;
    name?: string;
    username?: string;
  }): Promise<User> {
    const { email, password, name, username } = data;

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await hash(password, 12);
    return this.usersService.createLocalUser({
      email,
      passwordHash,
      name: name || username || 'Unknown User',
      username,
    });
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await this.verifyPassword(user, password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.updateLastLogin(user.id);

    const accessToken = this.issueToken({
      userId: user.id,
      email: user.email,
      roles: user.roles,
    });

    return { accessToken, expiresIn: this.jwtExpiresInSeconds };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);

    const passwordOk = await this.verifyPassword(user, currentPassword);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = await hash(newPassword, 12);
    await this.usersService.updatePasswordHash(userId, passwordHash);
  }

  async refreshToken(user: AuthenticatedUser): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const existingUser = await this.usersService.findOne(user.userId);
    const accessToken = this.issueToken({
      userId: existingUser.id,
      email: existingUser.email,
      roles: existingUser.roles,
    });

    return { accessToken, expiresIn: this.jwtExpiresInSeconds };
  }

  private issueToken(payload: {
    userId: string;
    email: string;
    roles: string[];
  }): string {
    return sign(
      {
        sub: payload.userId,
        email: payload.email,
        roles: payload.roles,
      },
      this.jwtSecret,
      {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        expiresIn: this.jwtExpiresInSeconds,
        algorithm: 'HS256',
      },
    );
  }

  private async verifyPassword(user: User, password: string): Promise<boolean> {
    const userWithPassword = user as unknown as {
      passwordHash?: string | null;
    };
    if (userWithPassword.passwordHash) {
      return compare(password, userWithPassword.passwordHash);
    }

    return false;
  }

  hasRole(user: { roles?: string[] }, requiredRole: string): boolean {
    return user.roles?.includes(requiredRole) ?? false;
  }

  hasAnyRole(user: { roles?: string[] }, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.some((role) => user.roles!.includes(role));
  }

  hasAllRoles(user: { roles?: string[] }, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.every((role) => user.roles!.includes(role));
  }
}
