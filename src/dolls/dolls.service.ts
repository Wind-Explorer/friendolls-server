import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { CreateDollDto, DollConfigurationDto } from './dto/create-doll.dto';
import { UpdateDollDto } from './dto/update-doll.dto';
import { Doll, Prisma } from '@prisma/client';
import {
  DollEvents,
  DollCreatedEvent,
  DollUpdatedEvent,
  DollDeletedEvent,
} from './events/doll.events';
import { CacheService } from '../common/cache/cache.service';
import { CacheTagsService } from '../common/cache/cache-tags.service';
import {
  CACHE_NAMESPACE,
  CACHE_TTL_SECONDS,
  dollsListCacheKey,
  dollsListOwnerTag,
  dollsListViewerTag,
} from '../common/cache/cache-keys';

@Injectable()
export class DollsService {
  private readonly logger = new Logger(DollsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    private readonly cacheTagsService: CacheTagsService,
  ) {}

  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });
    return friendships.map((f) => f.friendId);
  }

  async create(
    requestingUserId: string,
    createDollDto: CreateDollDto,
  ): Promise<Doll> {
    const defaultConfiguration: DollConfigurationDto = {
      colorScheme: {
        outline: '#000000',
        body: '#FFFFFF',
      },
    };

    // Merge default configuration with provided configuration
    // If configuration or colorScheme is not provided, use defaults
    const configuration: DollConfigurationDto = {
      ...defaultConfiguration,
      ...(createDollDto.configuration || {}),
      colorScheme: {
        ...defaultConfiguration.colorScheme!,
        ...(createDollDto.configuration?.colorScheme || {}),
      },
    };

    return this.prisma.doll
      .create({
        data: {
          name: createDollDto.name,
          configuration: configuration as unknown as Prisma.InputJsonValue,
          userId: requestingUserId,
        },
      })
      .then((doll) => {
        const event: DollCreatedEvent = {
          userId: requestingUserId,
          doll,
        };
        this.eventEmitter.emit(DollEvents.DOLL_CREATED, event);
        return doll;
      });
  }

  async listByOwner(
    ownerId: string,
    requestingUserId: string,
  ): Promise<Doll[]> {
    const cacheKey = dollsListCacheKey(ownerId, requestingUserId);
    const namespacedKey = this.cacheService.getNamespacedKey(
      CACHE_NAMESPACE.DOLLS_LIST,
      cacheKey,
    );
    const cached = await this.cacheService.get(namespacedKey);

    if (cached) {
      try {
        return JSON.parse(cached) as Doll[];
      } catch (error) {
        this.cacheService.recordError('dolls list parse', namespacedKey, error);
      }
    }

    const dolls = await this.listByOwnerFromDatabase(ownerId, requestingUserId);

    await this.cacheService.set(
      namespacedKey,
      JSON.stringify(dolls),
      CACHE_TTL_SECONDS.DOLLS_LIST,
    );
    await Promise.all([
      this.cacheTagsService.rememberKeyForTag(
        CACHE_NAMESPACE.DOLLS_LIST,
        dollsListOwnerTag(ownerId),
        cacheKey,
      ),
      this.cacheTagsService.rememberKeyForTag(
        CACHE_NAMESPACE.DOLLS_LIST,
        dollsListViewerTag(requestingUserId),
        cacheKey,
      ),
    ]);

    return dolls;
  }

  private async listByOwnerFromDatabase(
    ownerId: string,
    requestingUserId: string,
  ): Promise<Doll[]> {
    // If requesting own dolls, no need to check friendship
    if (ownerId === requestingUserId) {
      return this.prisma.doll.findMany({
        where: {
          userId: ownerId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    }

    // If requesting someone else's dolls, check friendship
    const friendIds = await this.getFriendIds(requestingUserId);
    if (!friendIds.includes(ownerId)) {
      throw new ForbiddenException('You are not friends with this user');
    }

    return this.prisma.doll.findMany({
      where: {
        userId: ownerId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string, requestingUserId: string): Promise<Doll> {
    const friendIds = await this.getFriendIds(requestingUserId);
    const accessibleUserIds = [requestingUserId, ...friendIds];

    const doll = await this.prisma.doll.findFirst({
      where: {
        id,
        userId: { in: accessibleUserIds },
        deletedAt: null,
      },
    });

    if (!doll) {
      throw new NotFoundException(
        `Doll with ID ${id} not found or access denied`,
      );
    }

    return doll;
  }

  async update(
    id: string,
    requestingUserId: string,
    updateDollDto: UpdateDollDto,
  ): Promise<Doll> {
    const doll = await this.findOne(id, requestingUserId);

    // Only owner can update
    if (doll.userId !== requestingUserId) {
      throw new ForbiddenException('You can only update your own dolls');
    }

    let configuration = doll.configuration as unknown as DollConfigurationDto;

    if (updateDollDto.configuration) {
      // Deep merge configuration if provided
      configuration = {
        ...configuration,
        ...updateDollDto.configuration,
        colorScheme: {
          outline:
            updateDollDto.configuration.colorScheme?.outline ||
            configuration.colorScheme?.outline ||
            '#000000',
          body:
            updateDollDto.configuration.colorScheme?.body ||
            configuration.colorScheme?.body ||
            '#FFFFFF',
        },
      };
    }

    return this.prisma.doll
      .update({
        where: { id },
        data: {
          name: updateDollDto.name,
          configuration: configuration as unknown as Prisma.InputJsonValue,
        },
      })
      .then((doll) => {
        const event: DollUpdatedEvent = {
          userId: requestingUserId,
          doll,
        };
        this.eventEmitter.emit(DollEvents.DOLL_UPDATED, event);
        return doll;
      });
  }

  async remove(id: string, requestingUserId: string): Promise<void> {
    const doll = await this.findOne(id, requestingUserId);

    // Only owner can delete
    if (doll.userId !== requestingUserId) {
      throw new ForbiddenException('You can only delete your own dolls');
    }

    // Soft delete
    await this.prisma.$transaction(async (tx) => {
      // 1. Soft delete the doll
      await tx.doll.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      // 2. Unset if it was active
      await tx.user.updateMany({
        where: { id: requestingUserId, activeDollId: id },
        data: { activeDollId: null },
      });
    });

    const event: DollDeletedEvent = {
      userId: requestingUserId,
      dollId: id,
    };
    this.eventEmitter.emit(DollEvents.DOLL_DELETED, event);
  }
}
