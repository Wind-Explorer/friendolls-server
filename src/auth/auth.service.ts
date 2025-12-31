import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { URLSearchParams } from 'url';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { User } from '../users/users.entity';

/**
 * Authentication Service
 *
 * Handles authentication-related business logic including:
 * - User login tracking from Keycloak tokens
 * - Profile synchronization from Keycloak
 * - Role-based authorization checks
 *
 * ## User Sync Strategy
 *
 * On every authentication:
 * - Creates new users with full profile data from Keycloak
 * - For existing users, compares Keycloak data with local database:
 *   - If profile changed: Updates all fields (email, name, username, picture, roles, lastLoginAt)
 *   - If profile unchanged: Only updates lastLoginAt (lightweight operation)
 *
 * This optimizes database performance since reads are cheaper than writes in PostgreSQL.
 * Most logins only update lastLoginAt, but profile changes sync automatically.
 *
 * For explicit profile sync (webhooks, admin operations), use:
 * - UsersService.syncProfileFromToken() - force sync regardless of changes
 *
 * ## Usage Guidelines
 *
 * - Use `syncUserFromToken()` for actual login events (WebSocket connections, /users/me)
 * - Use `ensureUserExists()` for regular API calls that just need the user record
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Revoke refresh token via Keycloak token revocation endpoint, if configured.
   * Returns true on success; false on missing config or failure.
   */
  async revokeToken(refreshToken: string): Promise<boolean> {
    const issuer = this.configService.get<string>('JWT_ISSUER');
    const clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'KEYCLOAK_CLIENT_SECRET',
    );

    if (!issuer || !clientId) {
      this.logger.warn(
        'JWT issuer or client id missing, skipping token revocation',
      );
      return false;
    }

    const revokeUrl = `${issuer}/protocol/openid-connect/revoke`;
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      if (clientSecret) {
        params.set('client_secret', clientSecret);
      }

      const response = await axios.post(revokeUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 500,
      });

      if (response.status >= 200 && response.status < 300) {
        this.logger.log('Refresh token revoked');
        return true;
      }

      this.logger.warn(
        `Token revocation failed with status ${response.status}`,
      );
      return false;
    } catch (error) {
      const err = error as AxiosError;
      this.logger.warn(
        `Failed to revoke token: ${err.response?.status} ${err.response?.statusText ?? err.message}`,
      );
      return false;
    }
  }

  /**
   * Handles user login and profile synchronization from Keycloak token.
   * Creates new users with full profile data.
   * For existing users, intelligently syncs only changed fields to optimize performance.
   *
   * The service compares Keycloak data with local database and:
   * - Updates profile fields only if they changed from Keycloak
   * - Always updates lastLoginAt to track login activity
   *
   * @param authenticatedUser - User data extracted from JWT token
   * @returns The user entity
   */
  async syncUserFromToken(authenticatedUser: AuthenticatedUser): Promise<User> {
    const { keycloakSub, email, name, username, picture, roles } =
      authenticatedUser;

    const user = await this.usersService.createFromToken({
      keycloakSub,
      email: email || '',
      name: name || username || 'Unknown User',
      username,
      picture,
      roles,
    });

    return user;
  }

  /**
   * Ensures a user exists in the local database without updating profile data.
   * This is optimized for regular API calls that need the user record but don't
   * need to sync profile data from Keycloak on every request.
   */
  async ensureUserExists(authenticatedUser: AuthenticatedUser): Promise<User> {
    const { keycloakSub, email, name, username, picture, roles } =
      authenticatedUser;

    return await this.usersService.findOrCreate({
      keycloakSub,
      email: email || '',
      name: name || username || 'Unknown User',
      username,
      picture,
      roles,
    });
  }

  hasRole(user: AuthenticatedUser, requiredRole: string): boolean {
    return user.roles?.includes(requiredRole) ?? false;
  }

  hasAnyRole(user: AuthenticatedUser, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.some((role) => user.roles!.includes(role));
  }

  hasAllRoles(user: AuthenticatedUser, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.every((role) => user.roles!.includes(role));
  }
}
