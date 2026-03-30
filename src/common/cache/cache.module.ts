import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../../database/redis.module';
import { CacheService } from './cache.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService, RedisThrottlerStorage],
  exports: [CacheService, RedisThrottlerStorage],
})
export class CacheModule {}
