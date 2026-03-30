import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

const CACHE_TAG_SET_TTL_SECONDS = 86_400;

@Injectable()
export class CacheTagsService {
  constructor(private readonly cacheService: CacheService) {}

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
}
