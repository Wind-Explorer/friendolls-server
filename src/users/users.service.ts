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
import { UserEvents } from './events/user.events';
import { normalizeEmail } from '../auth/auth.utils';

export interface CreateLocalUserDto {
  email: string;
  name: string;
  username?: string;
  passwordHash: string;
}

/**
 * Users Service
 *
 * Manages user data for local authentication using Prisma ORM.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Legacy Keycloak user creation removed in favor of local auth.

  // Legacy Keycloak sync logic removed in favor of local auth.

  // Legacy Keycloak sync docs removed in favor of local auth.
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
   * Currently, no profile fields are updatable locally.
   * This method exists for future extensibility if local fields are added.
   *
   * @param id - The user's internal ID
   * @param updateUserDto - The fields to update (currently none supported)
   * @param requestingUserId - The requesting user id
   * @returns The updated user
   * @throws NotFoundException if the user is not found
   * @throws ForbiddenException if the user tries to update someone else's profile
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requestingUserId: string,
  ): Promise<User> {
    const user = await this.findOne(id);

    // Verify the user is updating their own profile
    if (user.id !== requestingUserId) {
      this.logger.warn(
        `User ${requestingUserId} attempted to update user ${id}`,
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
  async delete(id: string, requestingUserId: string): Promise<void> {
    const user = await this.findOne(id);

    if (user.id !== requestingUserId) {
      this.logger.warn(
        `User ${requestingUserId} attempted to delete user ${id}`,
      );
      throw new ForbiddenException('You can only delete your own account');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User ${id} deleted their account`);
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
    requestingUserId: string,
  ): Promise<User> {
    const user = await this.findOne(userId);

    // Verify the user is updating their own profile
    if (user.id !== requestingUserId) {
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
    requestingUserId: string,
  ): Promise<User> {
    const user = await this.findOne(userId);

    // Verify the user is updating their own profile
    if (user.id !== requestingUserId) {
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

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: normalizeEmail(email) },
    });
  }

  async createLocalUser(createDto: CreateLocalUserDto): Promise<User> {
    const now = new Date();
    const roles: string[] = [];

    return this.prisma.user.create({
      data: {
        email: normalizeEmail(createDto.email),
        name: createDto.name,
        username: createDto.username,
        passwordHash: createDto.passwordHash,
        roles,
        lastLoginAt: now,
        keycloakSub: null,
      } as unknown as Prisma.UserUncheckedCreateInput,
    });
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash } as unknown as Prisma.UserUpdateInput,
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }
}
