import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { CacheService } from './cache.service';

interface RedisThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private static readonly IN_MEMORY_CLEANUP_INTERVAL = 500;
  private readonly inMemoryStorage = new Map<
    string,
    { totalHits: number; expiresAt: number; blockExpiresAt: number }
  >();
  private inMemoryOperationCount = 0;

  constructor(private readonly cacheService: CacheService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RedisThrottlerStorageRecord> {
    const safeLimit = Math.max(0, Math.floor(limit));
    const ttlMilliseconds = this.normalizeDurationMs(ttl);
    const blockDurationMilliseconds = this.normalizeDurationMs(blockDuration);
    const counterKey = this.cacheService.getNamespacedKey(
      'throttle:counter',
      `${throttlerName}:${key}`,
    );
    const blockKey = this.cacheService.getNamespacedKey(
      'throttle:block',
      `${throttlerName}:${key}`,
    );

    const redisClient = this.cacheService.getRedisClient();
    if (!redisClient) {
      this.cacheService.recordUnavailable();
      return this.incrementInMemory(
        counterKey,
        ttlMilliseconds,
        safeLimit,
        blockDurationMilliseconds,
      );
    }

    try {
      const initialized = await redisClient.set(
        counterKey,
        '1',
        'PX',
        ttlMilliseconds,
        'NX',
      );

      if (initialized === 'OK') {
        const existingBlockTtlRemainingMs = await redisClient.pttl(blockKey);
        return {
          totalHits: 1,
          timeToExpire: Math.ceil(ttlMilliseconds / 1000),
          isBlocked: existingBlockTtlRemainingMs > 0,
          timeToBlockExpire:
            existingBlockTtlRemainingMs > 0
              ? this.toSecondsFromPttl(
                  existingBlockTtlRemainingMs,
                  blockDurationMilliseconds,
                )
              : 0,
        };
      }

      const [
        existingBlockTtlRemainingMs,
        ttlRemainingBeforeHitMs,
        currentCount,
      ] = await Promise.all([
        redisClient.pttl(blockKey),
        redisClient.pttl(counterKey),
        redisClient.get(counterKey),
      ]);

      if (existingBlockTtlRemainingMs > 0) {
        const totalHits = Number(currentCount ?? '0');
        return {
          totalHits: Number.isFinite(totalHits) ? totalHits : 0,
          timeToExpire: this.toSecondsFromPttl(
            ttlRemainingBeforeHitMs,
            ttlMilliseconds,
          ),
          isBlocked: true,
          timeToBlockExpire: this.toSecondsFromPttl(
            existingBlockTtlRemainingMs,
            blockDurationMilliseconds,
          ),
        };
      }

      const count = await redisClient.incr(counterKey);
      if (count === 1) {
        await redisClient.pexpire(counterKey, ttlMilliseconds);
      }

      const [ttlRemainingMs, blockTtlRemainingMs] = await Promise.all([
        redisClient.pttl(counterKey),
        redisClient.pttl(blockKey),
      ]);

      let isBlocked = blockTtlRemainingMs > 0;

      if (!isBlocked && safeLimit > 0 && count > safeLimit) {
        await redisClient.set(blockKey, '1', 'PX', blockDurationMilliseconds);
        isBlocked = true;
      }

      const refreshedBlockTtlRemainingMs = isBlocked
        ? await redisClient.pttl(blockKey)
        : -1;

      return {
        totalHits: count,
        timeToExpire: this.toSecondsFromPttl(ttlRemainingMs, ttlMilliseconds),
        isBlocked,
        timeToBlockExpire: isBlocked
          ? this.toSecondsFromPttl(
              refreshedBlockTtlRemainingMs,
              blockDurationMilliseconds,
            )
          : 0,
      };
    } catch (error) {
      this.cacheService.recordError('throttler increment', counterKey, error);

      return this.incrementInMemory(
        counterKey,
        ttlMilliseconds,
        safeLimit,
        blockDurationMilliseconds,
      );
    }
  }

  private incrementInMemory(
    key: string,
    ttlMilliseconds: number,
    limit: number,
    blockDurationMilliseconds: number,
  ): RedisThrottlerStorageRecord {
    const now = Date.now();
    this.inMemoryOperationCount += 1;
    if (
      this.inMemoryOperationCount %
        RedisThrottlerStorage.IN_MEMORY_CLEANUP_INTERVAL ===
      0
    ) {
      this.cleanupExpiredInMemory(now);
    }

    const existing = this.inMemoryStorage.get(key);

    if (existing && existing.blockExpiresAt > now) {
      return {
        totalHits: existing.totalHits,
        timeToExpire: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(
          1,
          Math.ceil((existing.blockExpiresAt - now) / 1000),
        ),
      };
    }

    let totalHits = 1;
    let expiresAt = now + ttlMilliseconds;
    let blockExpiresAt = 0;

    if (existing && existing.expiresAt > now) {
      totalHits = existing.totalHits + 1;
      expiresAt = existing.expiresAt;
    }

    if (blockExpiresAt <= now) {
      blockExpiresAt = 0;
    }

    let isBlocked = blockExpiresAt > now;
    if (!isBlocked && limit > 0 && totalHits > limit) {
      blockExpiresAt = now + blockDurationMilliseconds;
      isBlocked = true;
    }

    this.inMemoryStorage.set(key, {
      totalHits,
      expiresAt,
      blockExpiresAt,
    });

    return {
      totalHits,
      timeToExpire: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked
        ? Math.max(1, Math.ceil((blockExpiresAt - now) / 1000))
        : 0,
    };
  }

  private normalizeDurationMs(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 1000;
    }

    return Math.max(1, Math.floor(value));
  }

  private toSecondsFromPttl(pttlMs: number, fallbackMs: number): number {
    if (pttlMs > 0) {
      return Math.max(1, Math.ceil(pttlMs / 1000));
    }

    return Math.max(1, Math.ceil(fallbackMs / 1000));
  }

  private cleanupExpiredInMemory(now: number): void {
    for (const [mapKey, value] of this.inMemoryStorage) {
      const counterExpired = value.expiresAt <= now;
      const blockExpired = value.blockExpiresAt <= now;

      if (counterExpired && blockExpired) {
        this.inMemoryStorage.delete(mapKey);
      }
    }
  }
}
