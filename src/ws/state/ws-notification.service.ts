import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { Server } from 'socket.io';
import { UserEvents } from '../../users/events/user.events';
import type { AuthenticatedSocket } from '../../types/socket';
import { REDIS_CLIENT } from '../../database/redis.module';
import { REDIS_CHANNEL } from './ws-events';
import { UserSocketService } from './user-socket.service';

const PRESENCE_UPDATE_THROTTLE_MS = 15_000;

@Injectable()
export class WsNotificationService {
  private readonly logger = new Logger(WsNotificationService.name);
  private io: Server | null = null;

  constructor(
    private readonly userSocketService: UserSocketService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {}

  setIo(io: Server) {
    this.io = io;
  }

  async emitToUser(userId: string, event: string, payload: any) {
    if (!this.io) return;
    const socketId = await this.userSocketService.getSocket(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, payload);
    }
  }

  async emitToFriends(userIds: string[], event: string, payload: any) {
    if (!this.io) return;
    const friendSockets =
      await this.userSocketService.getFriendsSockets(userIds);
    for (const { socketId } of friendSockets) {
      this.io.to(socketId).emit(event, payload);
    }
  }

  emitToSocket(socketId: string, event: string, payload: any) {
    if (!this.io) return;
    this.io.to(socketId).emit(event, payload);
  }

  @OnEvent(UserEvents.PROFILE_UPDATED)
  async handleUserProfileUpdated(payload: { userId: string }) {
    await this.publishUserProfileCacheInvalidate(payload.userId);
  }

  async updateFriendsCache(
    userId: string,
    friendId: string,
    action: 'add' | 'delete',
  ) {
    if (this.redisClient) {
      try {
        await this.redisClient.publish(
          REDIS_CHANNEL.FRIEND_CACHE_UPDATE,
          JSON.stringify({ userId, friendId, action }),
        );
        return;
      } catch (error) {
        this.logger.warn(
          'Redis publish failed for friend cache update; applying local cache update only',
          error as Error,
        );
      }
    }

    try {
      await this.updateFriendsCacheLocal(userId, friendId, action);
    } catch (error) {
      this.logger.error(
        'Failed to apply local friend cache update',
        error as Error,
      );
    }
  }

  async updateFriendsCacheLocal(
    userId: string,
    friendId: string,
    action: 'add' | 'delete',
  ) {
    if (!this.io) return;
    const socketId = await this.userSocketService.getSocket(userId);
    if (socketId) {
      const socket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (socket?.data?.friends) {
        if (action === 'add') socket.data.friends.add(friendId);
        else socket.data.friends.delete(friendId);
      }
    }
  }

  async updateActiveDollCache(userId: string, dollId: string | null) {
    if (!this.io) return;
    const socketId = await this.userSocketService.getSocket(userId);
    if (socketId) {
      const socket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (socket) socket.data.activeDollId = dollId;
    }
  }

  async publishActiveDollUpdate(userId: string, dollId: string | null) {
    if (this.redisClient) {
      try {
        await this.redisClient.publish(
          REDIS_CHANNEL.ACTIVE_DOLL_UPDATE,
          JSON.stringify({ userId, dollId }),
        );
        return;
      } catch (error) {
        this.logger.warn(
          'Redis publish failed for active doll update; applying local cache update only',
          error as Error,
        );
      }
    }

    try {
      await this.updateActiveDollCache(userId, dollId);
    } catch (error) {
      this.logger.error(
        'Failed to apply local active doll cache update',
        error as Error,
      );
    }
  }

  async publishUserProfileCacheInvalidate(userId: string) {
    if (this.redisClient) {
      try {
        await this.redisClient.publish(
          REDIS_CHANNEL.USER_PROFILE_CACHE_INVALIDATE,
          JSON.stringify({ userId }),
        );
        return;
      } catch (error) {
        this.logger.warn(
          'Redis publish failed for user profile cache invalidate; applying local update only',
          error as Error,
        );
      }
    }

    await this.clearSenderNameCache(userId);
  }

  async clearSenderNameCache(userId: string) {
    if (!this.io) {
      return;
    }

    const socketId = await this.userSocketService.getSocket(userId);
    if (!socketId) {
      return;
    }

    const socket = this.io.sockets.sockets.get(socketId) as
      | AuthenticatedSocket
      | undefined;
    if (!socket?.data) {
      return;
    }

    socket.data.senderName = undefined;
    socket.data.senderNameCachedAt = undefined;
  }

  async maybeTouchPresence(client: AuthenticatedSocket): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }

    const now = Date.now();
    const lastSeenAt = client.data.lastSeenAt;
    if (
      typeof lastSeenAt === 'number' &&
      now - lastSeenAt < PRESENCE_UPDATE_THROTTLE_MS
    ) {
      return;
    }

    client.data.lastSeenAt = now;
    await this.userSocketService.touchLastSeen(userId);
  }
}
