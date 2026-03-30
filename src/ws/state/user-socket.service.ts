import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';

const SOCKET_KEY_PREFIX = 'socket:user:';
const SOCKET_REVERSE_KEY_PREFIX = 'socket:id:';
const LAST_SEEN_KEY_PREFIX = 'presence:last-seen:';
const PRESENCE_ZSET_KEY = 'presence:last-seen:zset';

const SET_SOCKET_MAPPING_SCRIPT = `
local userKey = KEYS[1]
local reverseKey = KEYS[2]
local userId = ARGV[1]
local socketId = ARGV[2]
local ttl = ARGV[3]
local reversePrefix = ARGV[4]

local previousSocketId = redis.call('GET', userKey)
redis.call('SET', userKey, socketId, 'EX', ttl)
redis.call('SET', reverseKey, userId, 'EX', ttl)

if previousSocketId and previousSocketId ~= socketId then
  redis.call('DEL', reversePrefix .. previousSocketId)
end

return 1
`;

const REMOVE_SOCKET_MAPPING_SCRIPT = `
local userKey = KEYS[1]
local reversePrefix = ARGV[1]
local expectedSocketId = ARGV[2]

local currentSocketId = redis.call('GET', userKey)
if not currentSocketId then
  return 0
end

if expectedSocketId ~= '' and currentSocketId ~= expectedSocketId then
  return 0
end

redis.call('DEL', userKey)
redis.call('DEL', reversePrefix .. currentSocketId)
return 1
`;

const REMOVE_BY_SOCKET_ID_SCRIPT = `
local reverseKey = KEYS[1]
local userPrefix = ARGV[1]
local socketId = ARGV[2]

local userId = redis.call('GET', reverseKey)
if not userId then
  return 0
end

local userKey = userPrefix .. userId
local currentSocketId = redis.call('GET', userKey)

redis.call('DEL', reverseKey)
if currentSocketId == socketId then
  redis.call('DEL', userKey)
end

return 1
`;

@Injectable()
export class UserSocketService {
  private readonly logger = new Logger(UserSocketService.name);
  private localUserSocketMap: Map<string, string> = new Map();
  private readonly TTL = 86400; // 24 hours
  private readonly LAST_SEEN_TTL_SECONDS = 604800; // 7 days

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {}

  async setSocket(userId: string, socketId: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.eval(
          SET_SOCKET_MAPPING_SCRIPT,
          2,
          `${SOCKET_KEY_PREFIX}${userId}`,
          `${SOCKET_REVERSE_KEY_PREFIX}${socketId}`,
          userId,
          socketId,
          String(this.TTL),
          SOCKET_REVERSE_KEY_PREFIX,
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

  async removeSocket(userId: string, expectedSocketId?: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.eval(
          REMOVE_SOCKET_MAPPING_SCRIPT,
          1,
          `${SOCKET_KEY_PREFIX}${userId}`,
          SOCKET_REVERSE_KEY_PREFIX,
          expectedSocketId || '',
        );
      } catch (error) {
        this.logger.error(
          `Failed to remove socket for user ${userId} from Redis`,
          error,
        );
      }
    }
    if (!expectedSocketId) {
      this.localUserSocketMap.delete(userId);
      return;
    }

    const currentLocalSocketId = this.localUserSocketMap.get(userId);
    if (currentLocalSocketId === expectedSocketId) {
      this.localUserSocketMap.delete(userId);
    }
  }

  async getSocket(userId: string): Promise<string | null> {
    if (this.redisClient) {
      try {
        const socketId = await this.redisClient.get(
          `${SOCKET_KEY_PREFIX}${userId}`,
        );
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
        friendIds.forEach((id) => pipeline.get(`${SOCKET_KEY_PREFIX}${id}`));
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

  async touchLastSeen(userId: string): Promise<void> {
    const now = Date.now();
    if (this.redisClient) {
      try {
        const key = `${LAST_SEEN_KEY_PREFIX}${userId}`;
        await this.redisClient.set(
          key,
          String(now),
          'EX',
          this.LAST_SEEN_TTL_SECONDS,
        );
        await this.redisClient.zadd(PRESENCE_ZSET_KEY, now, userId);
        return;
      } catch (error) {
        this.logger.warn(
          `Failed to touch last-seen for user ${userId} in Redis`,
          error as Error,
        );
      }
    }
  }

  async removeSocketById(socketId: string): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient.eval(
        REMOVE_BY_SOCKET_ID_SCRIPT,
        1,
        `${SOCKET_REVERSE_KEY_PREFIX}${socketId}`,
        SOCKET_KEY_PREFIX,
        socketId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to remove socket mapping by socket id ${socketId}`,
        error as Error,
      );
    }
  }

  async cleanupStalePresence(cutoffMs: number): Promise<number> {
    if (!this.redisClient) {
      return 0;
    }

    try {
      const staleUserIds = await this.redisClient.zrangebyscore(
        PRESENCE_ZSET_KEY,
        '-inf',
        cutoffMs,
      );

      if (staleUserIds.length === 0) {
        return 0;
      }

      const pipeline = this.redisClient.pipeline();
      staleUserIds.forEach((userId) => {
        pipeline.del(`${LAST_SEEN_KEY_PREFIX}${userId}`);
      });
      pipeline.zremrangebyscore(PRESENCE_ZSET_KEY, '-inf', cutoffMs);
      await pipeline.exec();
      return staleUserIds.length;
    } catch (error) {
      this.logger.warn(
        'Failed to cleanup stale presence entries',
        error as Error,
      );
      return 0;
    }
  }
}
