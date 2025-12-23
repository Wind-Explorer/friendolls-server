import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { User, Prisma } from '@prisma/client';
import type { UpdateUserDto } from './dto/update-user.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { UserEvents } from './events/user.events';

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
 * Users Service
 *
 * Manages user data synchronized from Keycloak OIDC using Prisma ORM.
 * Users are created automatically when they first authenticate via Keycloak.
 * Direct user creation is not allowed - users must authenticate via Keycloak first.
 *
 * ## Profile Data Ownership
 *
 * Keycloak is the single source of truth for authentication and profile data:
 * - `keycloakSub`: Managed by Keycloak (immutable identifier)
 * - `email`: Managed by Keycloak
 * - `name`: Managed by Keycloak
 * - `username`: Managed by Keycloak
 * - `picture`: Managed by Keycloak
 * - `roles`: Managed by Keycloak
 *
 * Local application data:
 * - `lastLoginAt`: Tracked locally for analytics
 *
 * ## Sync Strategy
 *
 * - On every login: Compares Keycloak data with local data
 *   - If profile changed: Updates all fields (name, email, picture, roles)
 *   - If profile unchanged: Only updates `lastLoginAt`
 *   - Read operations are cheaper than writes in PostgreSQL
 * - Explicit sync: Call `syncProfileFromToken()` for force sync (webhooks, manual refresh)
 *
 * This optimizes performance by avoiding unnecessary writes while keeping
 * profile data in sync with Keycloak on every authentication.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Finds a user or creates one if they don't exist.
   * Optimized to minimize database operations:
   * - If user exists: Returns immediately (1 read, 0 writes)
   * - If user missing: Creates user (1 read, 1 write)
   *
   * Unlike createFromToken, this method does NOT update lastLoginAt for existing users.
   *
   * @param createDto - User data
   * @returns The user entity
   */
  async findOrCreate(createDto: CreateUserFromTokenDto): Promise<User> {
    // 1. Try to find the user (Read)
    const existingUser = await this.prisma.user.findUnique({
      where: { keycloakSub: createDto.keycloakSub },
    });

    // 2. If found, return immediately without update
    if (existingUser) {
      return existingUser;
    }

    // 3. If not found, create (Write)
    // We handle creation directly here to avoid a second read that createFromToken would do
    const roles = createDto.roles || [];
    const now = new Date();

    this.logger.log(`Creating new user from token: ${createDto.keycloakSub}`);

    // Use upsert to handle race conditions safely
    return await this.prisma.user.upsert({
      where: { keycloakSub: createDto.keycloakSub },
      update: {
        email: createDto.email,
        name: createDto.name,
        username: createDto.username,
        picture: createDto.picture,
        roles,
        lastLoginAt: now,
      },
      create: {
        keycloakSub: createDto.keycloakSub,
        email: createDto.email,
        name: createDto.name,
        username: createDto.username,
        picture: createDto.picture,
        roles,
        lastLoginAt: now,
      },
    });
  }

  /**
   * Creates a new user or syncs/tracks login for existing users.
   * This method is called automatically during authentication flow.
   *
   * For new users: Creates the user with full profile data from token.
   * For existing users: Compares Keycloak data with local data and only updates if changed.
   * This optimizes performance since reads are cheaper than writes in PostgreSQL.
   *
   * @param createDto - User data extracted from Keycloak JWT token
   * @returns The user entity
   */
  async createFromToken(createDto: CreateUserFromTokenDto): Promise<User> {
    // Normalize roles once to avoid duplication
    const roles = createDto.roles || [];
    const now = new Date();

    // Check if user exists first (read is cheaper than write)
    const existingUser = await this.prisma.user.findUnique({
      where: { keycloakSub: createDto.keycloakSub },
    });

    if (existingUser) {
      // Compare profile data to detect changes
      const profileChanged =
        existingUser.email !== createDto.email ||
        existingUser.name !== createDto.name ||
        existingUser.username !== createDto.username ||
        existingUser.picture !== createDto.picture ||
        JSON.stringify(existingUser.roles) !== JSON.stringify(roles);

      if (profileChanged) {
        // Profile data changed - update everything
        this.logger.debug(
          `Profile changed for user: ${existingUser.id} (${createDto.keycloakSub})`,
        );
        return await this.prisma.user.update({
          where: { keycloakSub: createDto.keycloakSub },
          data: {
            email: createDto.email,
            name: createDto.name,
            username: createDto.username,
            picture: createDto.picture,
            roles,
            lastLoginAt: now,
          },
        });
      } else {
        // Profile unchanged - only update lastLoginAt
        this.logger.debug(
          `Login tracked for user: ${existingUser.id} (${createDto.keycloakSub})`,
        );
        return await this.prisma.user.update({
          where: { keycloakSub: createDto.keycloakSub },
          data: {
            lastLoginAt: now,
          },
        });
      }
    }

    // New user - create with all profile data
    // Use upsert to handle race condition if user was created between findUnique and here
    this.logger.log(`Creating new user from token: ${createDto.keycloakSub}`);
    const user = await this.prisma.user.upsert({
      where: { keycloakSub: createDto.keycloakSub },
      update: {
        // If created by concurrent request, update with current data
        email: createDto.email,
        name: createDto.name,
        username: createDto.username,
        picture: createDto.picture,
        roles,
        lastLoginAt: now,
      },
      create: {
        keycloakSub: createDto.keycloakSub,
        email: createDto.email,
        name: createDto.name,
        username: createDto.username,
        picture: createDto.picture,
        roles,
        lastLoginAt: now,
      },
    });

    return user;
  }

  /**
   * Force syncs user profile data from Keycloak token.
   * This should be called when explicit profile sync is needed.
   *
   * Use cases:
   * - Keycloak webhook notification of profile change
   * - Manual profile refresh request
   * - Administrative profile sync operations
   *
   * Note: createFromToken() already handles profile sync on login automatically.
   * This method is for explicit, out-of-band sync operations.
   *
   * @param keycloakSub - The Keycloak subject identifier
   * @param profileData - Profile data from Keycloak token
   * @returns The updated user
   * @throws NotFoundException if the user is not found
   */
  async syncProfileFromToken(
    keycloakSub: string,
    profileData: Omit<CreateUserFromTokenDto, 'keycloakSub'>,
  ): Promise<User> {
    // Normalize roles once
    const roles = profileData.roles || [];

    try {
      const updatedUser = await this.prisma.user.update({
        where: { keycloakSub },
        data: {
          email: profileData.email,
          name: profileData.name,
          username: profileData.username,
          picture: profileData.picture,
          roles,
        },
      });

      this.logger.log(
        `Profile synced from Keycloak for user: ${updatedUser.id} (${keycloakSub})`,
      );

      return updatedUser;
    } catch (error) {
      // Prisma throws P2025 when record is not found
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          `User with keycloakSub ${keycloakSub} not found`,
        );
      }
      throw error;
    }
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
   * Updates a user's profile.
   * Currently, all profile fields are managed by Keycloak and cannot be updated locally.
   * This method exists for future extensibility if local profile fields are added.
   *
   * @param id - The user's internal ID
   * @param updateUserDto - The fields to update (currently none supported)
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

    // Currently no fields are updatable locally - all managed by Keycloak
    // This structure allows for future extensibility if local fields are added
    const updateData: Record<string, never> = {};

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`User ${id} profile update requested`);

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

  async searchUsers(
    username?: string,
    excludeUserId?: string,
  ): Promise<User[]> {
    const where: Prisma.UserWhereInput = {};

    if (username) {
      where.username = {
        contains: username,
        mode: 'insensitive',
      };
    }

    if (excludeUserId) {
      where.id = {
        not: excludeUserId,
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      take: 20,
      orderBy: {
        username: 'asc',
      },
    });

    return users;
  }

  /**
   * Sets the active doll for a user.
   *
   * @param userId - The user's internal ID
   * @param dollId - The doll's internal ID
   * @param requestingUserKeycloakSub - The Keycloak sub of the requesting user
   * @throws NotFoundException if the user or doll is not found
   * @throws ForbiddenException if the doll does not belong to the user
   */
  async setActiveDoll(
    userId: string,
    dollId: string,
    requestingUserKeycloakSub: string,
  ): Promise<User> {
    const user = await this.findOne(userId);

    // Verify the user is updating their own profile
    if (user.keycloakSub !== requestingUserKeycloakSub) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Verify the doll exists and belongs to the user
    const doll = await this.prisma.doll.findUnique({
      where: { id: dollId },
    });

    if (!doll || doll.deletedAt) {
      throw new NotFoundException(`Doll with ID ${dollId} not found`);
    }

    if (doll.userId !== userId) {
      throw new ForbiddenException('You can only activate your own dolls');
    }

    // Update the active doll
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { activeDollId: dollId },
      include: { activeDoll: true },
    });

    this.logger.log(`User ${userId} activated doll ${dollId}`);

    this.eventEmitter.emit(UserEvents.ACTIVE_DOLL_CHANGED, {
      userId,
      dollId,
      doll,
    });

    return updatedUser;
  }

  /**
   * Removes the active doll for a user.
   *
   * @param userId - The user's internal ID
   * @param requestingUserKeycloakSub - The Keycloak sub of the requesting user
   * @throws NotFoundException if the user is not found
   */
  async removeActiveDoll(
    userId: string,
    requestingUserKeycloakSub: string,
  ): Promise<User> {
    const user = await this.findOne(userId);

    // Verify the user is updating their own profile
    if (user.keycloakSub !== requestingUserKeycloakSub) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Remove the active doll
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { activeDollId: null },
    });

    this.logger.log(`User ${userId} deactivated their doll`);

    this.eventEmitter.emit(UserEvents.ACTIVE_DOLL_CHANGED, {
      userId,
      dollId: null,
      doll: null,
    });

    return updatedUser;
  }
}
