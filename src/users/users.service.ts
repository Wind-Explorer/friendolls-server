import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { User } from './users.entity';
import type { UpdateUserDto } from './dto/update-user.dto';

/**
 * Interface for creating a user from Keycloak token
 */
export interface CreateUserFromTokenDto {
  keycloakSub: string;
  email: string;
  name: string;
  username?: string;
  picture?: string;
  roles?: string[];
}

/**
 * Interface for updating a user from Keycloak token
 */
export interface UpdateUserFromTokenDto {
  email?: string;
  name?: string;
  username?: string;
  picture?: string;
  roles?: string[];
  lastLoginAt?: Date;
}

/**
 * Users Service
 *
 * Manages user data synchronized from Keycloak OIDC.
 * Users are created automatically when they first authenticate via Keycloak.
 * Direct user creation is not allowed - users must authenticate via Keycloak first.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private users: User[] = [];

  /**
   * Creates a new user from Keycloak token data.
   * This method is called automatically during authentication flow.
   *
   * @param createDto - User data extracted from Keycloak JWT token
   * @returns The newly created user
   */
  createFromToken(createDto: CreateUserFromTokenDto): User {
    const existingUser = this.users.find(
      (u) => u.keycloakSub === createDto.keycloakSub,
    );

    if (existingUser) {
      this.logger.warn(
        `Attempted to create duplicate user with keycloakSub: ${createDto.keycloakSub}`,
      );
      return existingUser;
    }

    const newUser = new User();
    newUser.id = randomUUID();
    newUser.keycloakSub = createDto.keycloakSub;
    newUser.email = createDto.email;
    newUser.name = createDto.name;
    newUser.username = createDto.username;
    newUser.picture = createDto.picture;
    newUser.roles = createDto.roles;
    newUser.createdAt = new Date();
    newUser.updatedAt = new Date();
    newUser.lastLoginAt = new Date();

    this.users.push(newUser);

    this.logger.log(`Created new user: ${newUser.id} (${newUser.keycloakSub})`);

    return newUser;
  }

  /**
   * Finds a user by their Keycloak subject identifier.
   *
   * @param keycloakSub - The Keycloak subject (sub claim from JWT)
   * @returns The user if found, null otherwise
   */
  findByKeycloakSub(keycloakSub: string): User | null {
    const user = this.users.find((u) => u.keycloakSub === keycloakSub);
    return user || null;
  }

  /**
   * Finds a user by their internal ID.
   *
   * @param id - The user's internal UUID
   * @returns The user entity
   * @throws NotFoundException if the user is not found
   */
  findOne(id: string): User {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Updates a user's profile from Keycloak token data.
   * This syncs the user's data from Keycloak during authentication.
   *
   * @param keycloakSub - The Keycloak subject identifier
   * @param updateDto - Updated user data from token
   * @returns The updated user
   * @throws NotFoundException if the user is not found
   */
  updateFromToken(
    keycloakSub: string,
    updateDto: UpdateUserFromTokenDto,
  ): User {
    const user = this.findByKeycloakSub(keycloakSub);
    if (!user) {
      throw new NotFoundException(
        `User with keycloakSub ${keycloakSub} not found`,
      );
    }

    // Update user properties from token
    if (updateDto.email !== undefined) user.email = updateDto.email;
    if (updateDto.name !== undefined) user.name = updateDto.name;
    if (updateDto.username !== undefined) user.username = updateDto.username;
    if (updateDto.picture !== undefined) user.picture = updateDto.picture;
    if (updateDto.roles !== undefined) user.roles = updateDto.roles;
    if (updateDto.lastLoginAt !== undefined)
      user.lastLoginAt = updateDto.lastLoginAt;

    user.updatedAt = new Date();

    this.logger.debug(`Synced user from token: ${user.id} (${keycloakSub})`);

    return user;
  }

  /**
   * Updates a user's profile.
   * Users can only update their own profile (enforced by controller).
   *
   * @param id - The user's internal ID
   * @param updateUserDto - The fields to update
   * @param requestingUserKeycloakSub - The Keycloak sub of the requesting user
   * @returns The updated user
   * @throws NotFoundException if the user is not found
   * @throws ForbiddenException if the user tries to update someone else's profile
   */
  update(
    id: string,
    updateUserDto: UpdateUserDto,
    requestingUserKeycloakSub: string,
  ): User {
    const user = this.findOne(id);

    // Verify the user is updating their own profile
    if (user.keycloakSub !== requestingUserKeycloakSub) {
      this.logger.warn(
        `User ${requestingUserKeycloakSub} attempted to update user ${id}`,
      );
      throw new ForbiddenException('You can only update your own profile');
    }

    // Only allow updating specific fields via the public API
    // Security-sensitive fields (keycloakSub, roles, etc.) cannot be updated
    if (updateUserDto.name !== undefined) {
      user.name = updateUserDto.name;
    }

    user.updatedAt = new Date();

    this.logger.log(`User ${id} updated their profile`);

    return user;
  }

  /**
   * Deletes a user from the system.
   * Note: This only removes the local user record.
   * The user still exists in Keycloak and can re-authenticate.
   *
   * @param id - The user's internal ID
   * @param requestingUserKeycloakSub - The Keycloak sub of the requesting user
   * @throws NotFoundException if the user is not found
   * @throws ForbiddenException if the user tries to delete someone else's account
   */
  delete(id: string, requestingUserKeycloakSub: string): void {
    const user = this.findOne(id);

    // Verify the user is deleting their own account
    if (user.keycloakSub !== requestingUserKeycloakSub) {
      this.logger.warn(
        `User ${requestingUserKeycloakSub} attempted to delete user ${id}`,
      );
      throw new ForbiddenException('You can only delete your own account');
    }

    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    this.users.splice(index, 1);

    this.logger.log(
      `User ${id} deleted their account (Keycloak: ${requestingUserKeycloakSub})`,
    );
  }
}
