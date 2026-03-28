import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { INestApplicationContext, Logger } from '@nestjs/common';
import {
  parsePositiveInteger,
  parseRedisRequired,
} from '../common/config/env.utils';

const DEFAULT_REDIS_STARTUP_RETRIES = 10;

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    private app: INestApplicationContext,
    private configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = parsePositiveInteger(
      this.configService.get<string>('REDIS_PORT'),
      6379,
    );
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const startupRetries = parsePositiveInteger(
      this.configService.get<string>('REDIS_STARTUP_RETRIES'),
      DEFAULT_REDIS_STARTUP_RETRIES,
    );
    const redisRequired = parseRedisRequired({
      nodeEnv: this.configService.get<string>('NODE_ENV'),
      redisRequired: this.configService.get<string>('REDIS_REQUIRED'),
    });

    if (!host) {
      if (redisRequired) {
        throw new Error(
          'REDIS_REQUIRED is enabled but REDIS_HOST is not configured',
        );
      }

      this.logger.log('Redis adapter disabled (REDIS_HOST not set)');
      return;
    }

    this.logger.log(`Connecting Redis adapter to ${host}:${port}`);

    try {
      const connectTimeout = parsePositiveInteger(
        this.configService.get<string>('REDIS_CONNECT_TIMEOUT_MS'),
        5000,
      );
      const pubClient = new Redis({
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

          return Math.min(times * 50, 2000);
        },
      });

      const subClient = pubClient.duplicate();

      await pubClient.connect();
      await subClient.connect();
      await pubClient.ping();
      await subClient.ping();

      this.logger.log('Redis Pub/Sub clients connected');

      // Handle subsequent errors gracefully
      pubClient.on('error', (err) => {
        this.logger.error('Redis Pub client error', err);
      });
      subClient.on('error', (err) => {
        // Suppress specific error about subscriber mode restrictions
        // This is a known issue/behavior when ioredis performs internal checks (like info) on a subscriber connection
        if (
          err.message &&
          err.message.includes(
            'Connection in subscriber mode, only subscriber commands may be used',
          )
        ) {
          return;
        }
        this.logger.error('Redis Sub client error', err);
      });

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.pubClient = pubClient;
      this.subClient = subClient;
      this.logger.log('Redis adapter initialized successfully');
    } catch (error) {
      await this.close();
      this.logger.error('Failed to initialize Redis adapter', error);

      if (redisRequired) {
        throw error;
      }
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const cors = {
      origin: true,
      credentials: true,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const server = super.createIOServer(port, {
      ...(options ?? {}),
      cors,
    });
    if (this.adapterConstructor) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async close(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(
      (client): client is Redis => client !== null,
    );

    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }),
    );

    this.pubClient = null;
    this.subClient = null;
  }
}
