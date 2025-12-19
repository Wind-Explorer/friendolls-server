import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';

@Injectable()
export class UserSocketService {
  private readonly logger = new Logger(UserSocketService.name);
  private localUserSocketMap: Map<string, string> = new Map();
  private readonly PREFIX = 'socket:user:';
  private readonly TTL = 86400; // 24 hours

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {}

  async setSocket(userId: string, socketId: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.set(
          `${this.PREFIX}${userId}`,
          socketId,
          'EX',
          this.TTL,
        );
      } catch (error) {
        this.logger.error(
          `Failed to set socket for user ${userId} in Redis`,
          error,
        );
        // Fallback to local map on error? Or just log?
        // Let's use local map as backup if redis is down/null
        this.localUserSocketMap.set(userId, socketId);
      }
    } else {
      this.localUserSocketMap.set(userId, socketId);
    }
  }

  async removeSocket(userId: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(`${this.PREFIX}${userId}`);
      } catch (error) {
        this.logger.error(
          `Failed to remove socket for user ${userId} from Redis`,
          error,
        );
      }
    }
    this.localUserSocketMap.delete(userId);
  }

  async getSocket(userId: string): Promise<string | null> {
    if (this.redisClient) {
      try {
        const socketId = await this.redisClient.get(`${this.PREFIX}${userId}`);
        return socketId;
      } catch (error) {
        this.logger.error(
          `Failed to get socket for user ${userId} from Redis`,
          error,
        );
        return this.localUserSocketMap.get(userId) || null;
      }
    }
    return this.localUserSocketMap.get(userId) || null;
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const socketId = await this.getSocket(userId);
    return !!socketId;
  }

  async getFriendsSockets(
    friendIds: string[],
  ): Promise<{ userId: string; socketId: string }[]> {
    if (friendIds.length === 0) {
      return [];
    }

    if (this.redisClient) {
      try {
        // Use pipeline for batch fetching
        const pipeline = this.redisClient.pipeline();
        friendIds.forEach((id) => pipeline.get(`${this.PREFIX}${id}`));
        const results = await pipeline.exec();

        const sockets: { userId: string; socketId: string }[] = [];

        if (results) {
          results.forEach((result, index) => {
            const [err, socketId] = result;
            if (!err && socketId && typeof socketId === 'string') {
              sockets.push({ userId: friendIds[index], socketId });
            }
          });
        }
        return sockets;
      } catch (error) {
        this.logger.error(
          'Failed to batch get friend sockets from Redis',
          error,
        );
        // Fallback to local implementation
      }
    }

    // Local fallback
    const sockets: { userId: string; socketId: string }[] = [];
    for (const friendId of friendIds) {
      const socketId = this.localUserSocketMap.get(friendId);
      if (socketId) {
        sockets.push({ userId: friendId, socketId });
      }
    }
    return sockets;
  }
}
