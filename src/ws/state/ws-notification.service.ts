import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Server } from 'socket.io';
import { UserSocketService } from './user-socket.service';
import type { AuthenticatedSocket } from '../../types/socket';
import { REDIS_CLIENT } from '../../database/redis.module';
import { REDIS_CHANNEL } from './ws-events';

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

  async updateFriendsCache(
    userId: string,
    friendId: string,
    action: 'add' | 'delete',
  ) {
    if (this.redisClient) {
      await this.redisClient.publish(
        REDIS_CHANNEL.FRIEND_CACHE_UPDATE,
        JSON.stringify({ userId, friendId, action }),
      );
    } else {
      // Fallback: update locally
      await this.updateFriendsCacheLocal(userId, friendId, action);
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
      await this.redisClient.publish(
        REDIS_CHANNEL.ACTIVE_DOLL_UPDATE,
        JSON.stringify({ userId, dollId }),
      );
    } else {
      // Fallback: update locally
      await this.updateActiveDollCache(userId, dollId);
    }
  }
}
