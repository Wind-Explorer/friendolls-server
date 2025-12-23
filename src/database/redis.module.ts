import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER_CLIENT = 'REDIS_SUBSCRIBER_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const host = configService.get<string>('REDIS_HOST');
        const port = configService.get<number>('REDIS_PORT');
        const password = configService.get<string>('REDIS_PASSWORD');

        // Fallback or "disabled" mode if no host is provided
        if (!host) {
          logger.warn(
            'REDIS_HOST not defined. Redis features will be disabled or fall back to local memory.',
          );
          return null;
        }

        const client = new Redis({
          host,
          port: port || 6379,
          password: password,
          // Retry strategy: keep trying to reconnect
          retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        client.on('error', (err) => {
          logger.error('Redis connection error', err);
        });

        client.on('connect', () => {
          logger.log(`Connected to Redis at ${host}:${port || 6379}`);
        });

        return client;
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisSubscriberModule');
        const host = configService.get<string>('REDIS_HOST');
        const port = configService.get<number>('REDIS_PORT');
        const password = configService.get<string>('REDIS_PASSWORD');

        if (!host) {
          return null;
        }

        const client = new Redis({
          host,
          port: port || 6379,
          password: password,
          retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        client.on('error', (err) => {
          // Suppress the known error that happens when ioredis tries to perform checks on a subscriber connection
          if (
            err.message &&
            err.message.includes(
              'Connection in subscriber mode, only subscriber commands may be used',
            )
          ) {
            return;
          }
          logger.error('Redis subscriber connection error', err);
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER_CLIENT],
})
export class RedisModule {}
