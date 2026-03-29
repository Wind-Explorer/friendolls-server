import {
  Inject,
  Injectable,
  Logger,
  Module,
  Global,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  parsePositiveInteger,
  parseRedisRequired,
} from '../common/config/env.utils';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER_CLIENT = 'REDIS_SUBSCRIBER_CLIENT';

const DEFAULT_REDIS_STARTUP_RETRIES = 10;

@Injectable()
class RedisLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLifecycleService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
    @Inject(REDIS_SUBSCRIBER_CLIENT)
    private readonly redisSubscriber: Redis | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    const clients = [this.redisClient, this.redisSubscriber].filter(
      (client): client is Redis => client !== null,
    );

    if (clients.length === 0) {
      return;
    }

    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.quit();
        } catch (error) {
          this.logger.warn(
            'Redis quit failed, forcing disconnect',
            error as Error,
          );
          client.disconnect();
        }
      }),
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const host = configService.get<string>('REDIS_HOST');
        const port = parsePositiveInteger(
          configService.get<string>('REDIS_PORT'),
          6379,
        );
        const password = configService.get<string>('REDIS_PASSWORD');
        const connectTimeout = parsePositiveInteger(
          configService.get<string>('REDIS_CONNECT_TIMEOUT_MS'),
          5000,
        );
        const redisRequired = parseRedisRequired({
          nodeEnv: configService.get<string>('NODE_ENV'),
          redisRequired: configService.get<string>('REDIS_REQUIRED'),
        });
        const startupRetries = parsePositiveInteger(
          configService.get<string>('REDIS_STARTUP_RETRIES'),
          DEFAULT_REDIS_STARTUP_RETRIES,
        );

        if (!host) {
          if (redisRequired) {
            throw new Error(
              'REDIS_REQUIRED is enabled but REDIS_HOST is not configured',
            );
          }

          logger.warn('REDIS_HOST not defined. Redis features are disabled.');
          return null;
        }

        const client = new Redis({
          host,
          port,
          password,
          lazyConnect: true,
          connectTimeout,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy(times) {
            if (times > startupRetries) {
              return null;
            }

            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        client.on('connect', () => {
          logger.log(`Connected to Redis at ${host}:${port}`);
        });

        try {
          await client.connect();
          await client.ping();
        } catch {
          client.disconnect();

          if (redisRequired) {
            throw new Error(
              `Failed to connect to required Redis at ${host}:${port}`,
            );
          }

          logger.warn('Redis connection failed; Redis features are disabled.');
          return null;
        }

        return client;
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('RedisSubscriberModule');
        const host = configService.get<string>('REDIS_HOST');
        const port = parsePositiveInteger(
          configService.get<string>('REDIS_PORT'),
          6379,
        );
        const password = configService.get<string>('REDIS_PASSWORD');
        const connectTimeout = parsePositiveInteger(
          configService.get<string>('REDIS_CONNECT_TIMEOUT_MS'),
          5000,
        );
        const redisRequired = parseRedisRequired({
          nodeEnv: configService.get<string>('NODE_ENV'),
          redisRequired: configService.get<string>('REDIS_REQUIRED'),
        });
        const startupRetries = parsePositiveInteger(
          configService.get<string>('REDIS_STARTUP_RETRIES'),
          DEFAULT_REDIS_STARTUP_RETRIES,
        );

        if (!host) {
          return null;
        }

        const client = new Redis({
          host,
          port,
          password,
          lazyConnect: true,
          connectTimeout,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy(times) {
            if (times > startupRetries) {
              return null;
            }

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

        try {
          await client.connect();
          await client.ping();
        } catch {
          client.disconnect();

          if (redisRequired) {
            throw new Error(
              `Failed to connect to required Redis subscriber at ${host}:${port}`,
            );
          }

          logger.warn(
            'Redis subscriber connection failed; cross-instance subscriptions are disabled.',
          );
          return null;
        }

        return client;
      },
      inject: [ConfigService],
    },
    RedisLifecycleService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER_CLIENT],
})
export class RedisModule {}
