import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { parsePositiveInteger } from '../config/env.utils';

const CACHE_TAG_SET_TTL_SECONDS = 86_400;
const DEFAULT_CACHE_TAG_MAX_ENTRIES = 5_000;

@Injectable()
export class CacheTagsService {
  private readonly cacheTagMaxEntries: number;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.cacheTagMaxEntries = parsePositiveInteger(
      this.configService.get<string>('CACHE_TAG_MAX_ENTRIES'),
      DEFAULT_CACHE_TAG_MAX_ENTRIES,
    );
  }

  async rememberKeyForTag(
    namespace: string,
    tag: string,
    cacheKey: string,
  ): Promise<void> {
    const redisClient = this.cacheService.getRedisClient();
    if (!redisClient) {
      return;
    }

    const tagSetKey = this.getTagSetKey(namespace, tag);
    const keyWithNamespace = this.cacheService.getNamespacedKey(
      namespace,
      cacheKey,
    );

    try {
      await Promise.all([
        redisClient.sadd(tagSetKey, keyWithNamespace),
        redisClient.expire(tagSetKey, CACHE_TAG_SET_TTL_SECONDS),
      ]);

      const size = await redisClient.scard(tagSetKey);
      if (size > this.cacheTagMaxEntries) {
        await this.trimTagSet(tagSetKey, size - this.cacheTagMaxEntries);
      }
    } catch (error) {
      this.cacheService.recordError('tag remember', tagSetKey, error);
    }
  }

  async invalidateTag(namespace: string, tag: string): Promise<void> {
    const redisClient = this.cacheService.getRedisClient();
    if (!redisClient) {
      return;
    }

    const tagSetKey = this.getTagSetKey(namespace, tag);

    try {
      const keys = await redisClient.smembers(tagSetKey);
      if (keys.length === 0) {
        await redisClient.del(tagSetKey);
        return;
      }

      const pipeline = redisClient.pipeline();
      keys.forEach((key) => pipeline.del(key));
      pipeline.del(tagSetKey);
      await pipeline.exec();
    } catch (error) {
      this.cacheService.recordError('tag invalidate', tagSetKey, error);
    }
  }

  private getTagSetKey(namespace: string, tag: string): string {
    return this.cacheService.getNamespacedKey(
      'cache-tag',
      `${namespace}:${tag}`,
    );
  }

  private async trimTagSet(
    tagSetKey: string,
    countToDrop: number,
  ): Promise<void> {
    const redisClient = this.cacheService.getRedisClient();
    if (!redisClient || countToDrop <= 0) {
      return;
    }

    try {
      const sample = await redisClient.srandmember(tagSetKey, countToDrop);
      const members = Array.isArray(sample) ? sample : [sample].filter(Boolean);
      if (members.length === 0) {
        return;
      }

      await redisClient.srem(tagSetKey, ...members);
    } catch (error) {
      this.cacheService.recordError('tag trim', tagSetKey, error);
    }
  }
}
