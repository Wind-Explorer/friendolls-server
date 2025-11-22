import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { User } from '../users/users.entity';

/**
 * Authentication Service
 *
 * Handles authentication-related business logic including:
 * - User synchronization from Keycloak tokens
 * - Profile updates for authenticated users
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Synchronizes a user from Keycloak token to local database.
   * Creates a new user if they don't exist, or updates their last login time.
   *
   * @param authenticatedUser - User data extracted from JWT token
   * @returns The synchronized user entity
   */
  async syncUserFromToken(authenticatedUser: AuthenticatedUser): Promise<User> {
    const { keycloakSub, email, name, username, picture, roles } =
      authenticatedUser;

    // Try to find existing user by Keycloak subject
    let user = this.usersService.findByKeycloakSub(keycloakSub);

    if (user) {
      // User exists - update last login and sync profile data
      this.logger.debug(`Syncing existing user: ${keycloakSub}`);
      user = this.usersService.updateFromToken(keycloakSub, {
        email,
        name,
        username,
        picture,
        roles,
        lastLoginAt: new Date(),
      });
    } else {
      // New user - create from token data
      this.logger.log(`Creating new user from token: ${keycloakSub}`);
      user = this.usersService.createFromToken({
        keycloakSub,
        email: email || '',
        name: name || username || 'Unknown User',
        username,
        picture,
        roles,
      });
    }

    return Promise.resolve(user);
  }

  /**
   * Validates if a user has a specific role.
   *
   * @param user - The authenticated user
   * @param requiredRole - The role to check for
   * @returns True if the user has the role, false otherwise
   */
  hasRole(user: AuthenticatedUser, requiredRole: string): boolean {
    return user.roles?.includes(requiredRole) ?? false;
  }

  /**
   * Validates if a user has any of the specified roles.
   *
   * @param user - The authenticated user
   * @param requiredRoles - Array of roles to check for
   * @returns True if the user has at least one of the roles, false otherwise
   */
  hasAnyRole(user: AuthenticatedUser, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.some((role) => user.roles!.includes(role));
  }

  /**
   * Validates if a user has all of the specified roles.
   *
   * @param user - The authenticated user
   * @param requiredRoles - Array of roles to check for
   * @returns True if the user has all of the roles, false otherwise
   */
  hasAllRoles(user: AuthenticatedUser, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.every((role) => user.roles!.includes(role));
  }
}
