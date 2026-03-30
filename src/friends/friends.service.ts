import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { User, FriendRequest, FriendRequestStatus } from '@prisma/client';
import {
  FriendEvents,
  FriendRequestReceivedEvent,
  FriendRequestAcceptedEvent,
  FriendRequestDeniedEvent,
  UnfriendedEvent,
} from './events/friend.events';
import { CacheService } from '../common/cache/cache.service';
import { CacheTagsService } from '../common/cache/cache-tags.service';
import {
  CACHE_NAMESPACE,
  CACHE_TTL_SECONDS,
  friendshipCheckCacheKey,
  friendshipCheckUserTag,
  friendsListCacheKey,
  friendsListDependsOnUserTag,
  friendsListOwnerTag,
} from '../common/cache/cache-keys';

export type FriendRequestWithRelations = FriendRequest & {
  sender: User;
  receiver: User;
};

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    private readonly cacheTagsService: CacheTagsService,
  ) {}

  async sendFriendRequest(
    senderId: string,
    receiverId: string,
  ): Promise<FriendRequestWithRelations> {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const friendRequest = await this.prisma.$transaction(async (tx) => {
      const receiver = await tx.user.findUnique({
        where: { id: receiverId },
      });

      if (!receiver) {
        throw new NotFoundException('User not found');
      }

      // Check for existing friendship using the transaction client
      const existingFriendship = await tx.friendship.findFirst({
        where: {
          userId: senderId,
          friendId: receiverId,
        },
      });

      if (existingFriendship) {
        throw new ConflictException('You are already friends with this user');
      }

      const existingRequest = await tx.friendRequest.findFirst({
        where: {
          OR: [
            { senderId, receiverId },
            {
              senderId: receiverId,
              receiverId: senderId,
            },
          ],
        },
      });

      if (existingRequest) {
        if (existingRequest.status === FriendRequestStatus.PENDING) {
          if (existingRequest.senderId === senderId) {
            throw new ConflictException(
              'You already sent a friend request to this user',
            );
          } else {
            throw new ConflictException(
              'This user already sent you a friend request',
            );
          }
        } else {
          // If there's an existing request that is not pending (accepted or denied), delete it so a new one can be created
          await tx.friendRequest.delete({
            where: { id: existingRequest.id },
          });
        }
      }

      return await tx.friendRequest.create({
        data: {
          senderId,
          receiverId,
          status: FriendRequestStatus.PENDING,
        },
        include: {
          sender: true,
          receiver: true,
        },
      });
    });

    this.logger.log(
      `Friend request sent from ${senderId} to ${receiverId} (ID: ${friendRequest.id})`,
    );

    // Emit event
    const event: FriendRequestReceivedEvent = {
      userId: receiverId,
      friendRequest,
    };
    this.eventEmitter.emit(FriendEvents.REQUEST_RECEIVED, event);

    return friendRequest;
  }

  async getPendingReceivedRequests(
    userId: string,
  ): Promise<FriendRequestWithRelations[]> {
    return this.prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        sender: true,
        receiver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getPendingSentRequests(
    userId: string,
  ): Promise<FriendRequestWithRelations[]> {
    return this.prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        sender: true,
        receiver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async acceptFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<FriendRequestWithRelations> {
    const friendRequest = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
      throw new BadRequestException(
        'You can only accept friend requests sent to you',
      );
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException(
        `Friend request is already ${friendRequest.status.toLowerCase()}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.friendRequest.delete({
        where: { id: requestId },
      }),
      this.prisma.friendship.create({
        data: {
          userId: friendRequest.senderId,
          friendId: friendRequest.receiverId,
        },
      }),
      this.prisma.friendship.create({
        data: {
          userId: friendRequest.receiverId,
          friendId: friendRequest.senderId,
        },
      }),
    ]);

    // Since we deleted the request, we return the original request object but with status accepted
    const result = {
      ...friendRequest,
      status: FriendRequestStatus.ACCEPTED,
      updatedAt: new Date(),
    };

    this.logger.log(
      `Friend request ${requestId} accepted. Users ${friendRequest.senderId} and ${friendRequest.receiverId} are now friends`,
    );

    // Emit event
    const event: FriendRequestAcceptedEvent = {
      userId: friendRequest.senderId,
      friendRequest: result,
    };
    this.eventEmitter.emit(FriendEvents.REQUEST_ACCEPTED, event);

    return result;
  }

  async denyFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<FriendRequestWithRelations> {
    const friendRequest = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
      throw new BadRequestException(
        'You can only deny friend requests sent to you',
      );
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException(
        `Friend request is already ${friendRequest.status.toLowerCase()}`,
      );
    }

    await this.prisma.friendRequest.delete({
      where: { id: requestId },
    });

    // Since we deleted the request, we return the original request object but with status denied
    const result = {
      ...friendRequest,
      status: FriendRequestStatus.DENIED,
      updatedAt: new Date(),
    };

    this.logger.log(`Friend request ${requestId} denied by user ${userId}`);

    // Emit event
    const event: FriendRequestDeniedEvent = {
      userId: friendRequest.senderId,
      friendRequest: result,
    };
    this.eventEmitter.emit(FriendEvents.REQUEST_DENIED, event);

    return result;
  }

  async getFriends(userId: string) {
    const cacheKey = friendsListCacheKey(userId);
    const namespacedKey = this.cacheService.getNamespacedKey(
      CACHE_NAMESPACE.FRIENDS_LIST,
      cacheKey,
    );
    const cached = await this.cacheService.get(namespacedKey);

    if (cached) {
      try {
        return JSON.parse(cached) as Awaited<
          ReturnType<PrismaService['friendship']['findMany']>
        >;
      } catch (error) {
        this.cacheService.recordError(
          'friends list parse',
          namespacedKey,
          error,
        );
      }
    }

    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      include: {
        friend: {
          include: {
            activeDoll: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    await this.cacheService.set(
      namespacedKey,
      JSON.stringify(friendships),
      CACHE_TTL_SECONDS.FRIENDS_LIST,
    );

    const dependentFriendTags = friendships.map((friendship) =>
      friendsListDependsOnUserTag(friendship.friendId),
    );
    const tags = [friendsListOwnerTag(userId), ...dependentFriendTags];

    await Promise.all(
      tags.map((tag) =>
        this.cacheTagsService.rememberKeyForTag(
          CACHE_NAMESPACE.FRIENDS_LIST,
          tag,
          cacheKey,
        ),
      ),
    );

    return friendships;
  }

  async unfriend(userId: string, friendId: string): Promise<void> {
    if (userId === friendId) {
      throw new BadRequestException('Cannot unfriend yourself');
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        userId,
        friendId,
      },
    });

    if (!friendship) {
      throw new NotFoundException('You are not friends with this user');
    }

    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });

    this.logger.log(`User ${userId} unfriended user ${friendId}`);

    // Emit event
    const event: UnfriendedEvent = {
      userId: friendId,
      friendId: userId,
    };
    this.eventEmitter.emit(FriendEvents.UNFRIENDED, event);
  }

  async areFriends(userId: string, friendId: string): Promise<boolean> {
    const cacheKey = friendshipCheckCacheKey(userId, friendId);
    const namespacedKey = this.cacheService.getNamespacedKey(
      CACHE_NAMESPACE.FRIENDSHIP_CHECK,
      cacheKey,
    );
    const cached = await this.cacheService.get(namespacedKey);

    if (cached === '1') {
      return true;
    }

    if (cached === '0') {
      return false;
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        userId,
        friendId,
      },
    });

    const areFriends = !!friendship;

    await this.cacheService.set(
      namespacedKey,
      areFriends ? '1' : '0',
      CACHE_TTL_SECONDS.FRIENDSHIP_CHECK,
    );

    await Promise.all([
      this.cacheTagsService.rememberKeyForTag(
        CACHE_NAMESPACE.FRIENDSHIP_CHECK,
        friendshipCheckUserTag(userId),
        cacheKey,
      ),
      this.cacheTagsService.rememberKeyForTag(
        CACHE_NAMESPACE.FRIENDSHIP_CHECK,
        friendshipCheckUserTag(friendId),
        cacheKey,
      ),
    ]);

    return areFriends;
  }
}
