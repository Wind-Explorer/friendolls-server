import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { INestApplicationContext, Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(
    private app: INestApplicationContext,
    private configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');
    const password = this.configService.get<string>('REDIS_PASSWORD');

    // Only set up Redis adapter if host is configured
    if (!host) {
      this.logger.log('Redis adapter disabled (REDIS_HOST not set)');
      return;
    }

    this.logger.log(`Connecting Redis adapter to ${host}:${port || 6379}`);

    try {
      const pubClient = new Redis({
        host,
        port: port || 6379,
        password: password,
        retryStrategy(times) {
          // Retry connecting but don't crash if Redis is temporarily down during startup
          return Math.min(times * 50, 2000);
        },
      });

      const subClient = pubClient.duplicate();

      // Wait for connection to ensure it's valid
      await new Promise<void>((resolve, reject) => {
        pubClient.once('connect', () => {
          this.logger.log('Redis Pub client connected');
          resolve();
        });
        pubClient.once('error', (err) => {
          this.logger.error('Redis Pub client error', err);
          reject(err);
        });
      });

      // Handle subsequent errors gracefully
      pubClient.on('error', (err) => {
        this.logger.error('Redis Pub client error', err);
      });
      subClient.on('error', (err) => {
        this.logger.error('Redis Sub client error', err);
      });

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Redis adapter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis adapter', error);
      // We don't throw here to allow the app to start without Redis if connection fails,
      // though functionality will be degraded if multiple instances are running.
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
