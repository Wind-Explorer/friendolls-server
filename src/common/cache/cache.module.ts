import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../../database/redis.module';
import { CacheTagsService } from './cache-tags.service';
import { CacheService } from './cache.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService, CacheTagsService, RedisThrottlerStorage],
  exports: [CacheService, CacheTagsService, RedisThrottlerStorage],
})
export class CacheModule {}
