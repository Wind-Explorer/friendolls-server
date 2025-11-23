import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { User } from '@prisma/client';
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
 * Manages user data synchronized from Keycloak OIDC using Prisma ORM.
 * Users are created automatically when they first authenticate via Keycloak.
 * Direct user creation is not allowed - users must authenticate via Keycloak first.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new user from Keycloak token data.
   * This method is called automatically during authentication flow.
   *
   * @param createDto - User data extracted from Keycloak JWT token
   * @returns The newly created user
   */
  async createFromToken(createDto: CreateUserFromTokenDto): Promise<User> {
    // Check if user already exists
    const existingUser = await this.findByKeycloakSub(createDto.keycloakSub);

    if (existingUser) {
      this.logger.warn(
        `Attempted to create duplicate user with keycloakSub: ${createDto.keycloakSub}`,
      );
      return existingUser;
    }

    const newUser = await this.prisma.user.create({
      data: {
        keycloakSub: createDto.keycloakSub,
        email: createDto.email,
        name: createDto.name,
        username: createDto.username,
        picture: createDto.picture,
        roles: createDto.roles || [],
        lastLoginAt: new Date(),
      },
    });

    this.logger.log(`Created new user: ${newUser.id} (${newUser.keycloakSub})`);

    return newUser;
  }

  /**
   * Finds a user by their Keycloak subject identifier.
   *
   * @param keycloakSub - The Keycloak subject (sub claim from JWT)
   * @returns The user if found, null otherwise
   */
  async findByKeycloakSub(keycloakSub: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakSub },
    });

    return user;
  }

  /**
   * Finds a user by their internal ID.
   *
   * @param id - The user's internal UUID
   * @returns The user entity
   * @throws NotFoundException if the user is not found
   */
  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

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
  async updateFromToken(
    keycloakSub: string,
    updateDto: UpdateUserFromTokenDto,
  ): Promise<User> {
    const user = await this.findByKeycloakSub(keycloakSub);

    if (!user) {
      throw new NotFoundException(
        `User with keycloakSub ${keycloakSub} not found`,
      );
    }

    // Prepare update data - only include defined fields
    const updateData: {
      email?: string;
      name?: string;
      username?: string;
      picture?: string;
      roles?: string[];
      lastLoginAt?: Date;
    } = {};

    if (updateDto.email !== undefined) updateData.email = updateDto.email;
    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.username !== undefined)
      updateData.username = updateDto.username;
    if (updateDto.picture !== undefined) updateData.picture = updateDto.picture;
    if (updateDto.roles !== undefined) updateData.roles = updateDto.roles;
    if (updateDto.lastLoginAt !== undefined)
      updateData.lastLoginAt = updateDto.lastLoginAt;

    const updatedUser = await this.prisma.user.update({
      where: { keycloakSub },
      data: updateData,
    });

    this.logger.debug(
      `Synced user from token: ${updatedUser.id} (${keycloakSub})`,
    );

    return updatedUser;
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
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requestingUserKeycloakSub: string,
  ): Promise<User> {
    const user = await this.findOne(id);

    // Verify the user is updating their own profile
    if (user.keycloakSub !== requestingUserKeycloakSub) {
      this.logger.warn(
        `User ${requestingUserKeycloakSub} attempted to update user ${id}`,
      );
      throw new ForbiddenException('You can only update your own profile');
    }

    // Only allow updating specific fields via the public API
    // Security-sensitive fields (keycloakSub, roles, etc.) cannot be updated
    const updateData: {
      name?: string;
    } = {};

    if (updateUserDto.name !== undefined) {
      updateData.name = updateUserDto.name;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`User ${id} updated their profile`);

    return updatedUser;
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
  async delete(id: string, requestingUserKeycloakSub: string): Promise<void> {
    const user = await this.findOne(id);

    // Verify the user is deleting their own account
    if (user.keycloakSub !== requestingUserKeycloakSub) {
      this.logger.warn(
        `User ${requestingUserKeycloakSub} attempted to delete user ${id}`,
      );
      throw new ForbiddenException('You can only delete your own account');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(
      `User ${id} deleted their account (Keycloak: ${requestingUserKeycloakSub})`,
    );
  }
}
