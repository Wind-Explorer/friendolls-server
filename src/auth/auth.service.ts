import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly usersService: UsersService) {}

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

    // Use createFromToken which handles upsert atomically
    // This prevents race conditions when multiple requests arrive simultaneously
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
   *
   * - For new users: Creates with full profile data
   * - For existing users: Returns existing record WITHOUT updating
   *
   * Use this for most API endpoints. Only use syncUserFromToken() for actual
   * login events (WebSocket connections, /users/me endpoint).
   *
   * @param authenticatedUser - User data extracted from JWT token
   * @returns The user entity
   */
  async ensureUserExists(authenticatedUser: AuthenticatedUser): Promise<User> {
    const { keycloakSub, email, name, username, picture, roles } =
      authenticatedUser;

    // Check if user exists
    const existingUser = await this.usersService.findByKeycloakSub(keycloakSub);

    if (existingUser) {
      // User exists - return without updating
      return existingUser;
    }

    // New user - create with full profile data
    this.logger.log(
      `Creating new user from token: ${keycloakSub} (via ensureUserExists)`,
    );

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
