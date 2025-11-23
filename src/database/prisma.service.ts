import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Type definitions for Prisma event payloads
 */
interface QueryEvent {
  query: string;
  params: string;
  duration: number;
}

interface ErrorEvent {
  message: string;
}

interface WarnEvent {
  message: string;
}

/**
 * Prisma Service
 *
 * Manages the Prisma Client instance and database connection lifecycle.
 * Automatically connects on module initialization and disconnects on module destruction.
 *
 * This service should be used throughout the application to interact with the database.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Initialize PostgreSQL connection pool
    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);

    // Initialize Prisma Client with the adapter
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Log database queries in development mode
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: QueryEvent) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    // Log errors and warnings

    this.$on('error' as never, (e: ErrorEvent) => {
      this.logger.error(`Database error: ${e.message}`);
    });

    this.$on('warn' as never, (e: WarnEvent) => {
      this.logger.warn(`Database warning: ${e.message}`);
    });
  }

  /**
   * Connect to the database when the module is initialized
   */
  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to database');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  /**
   * Disconnect from the database when the module is destroyed
   */
  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Successfully disconnected from database');
    } catch (error) {
      this.logger.error('Error disconnecting from database', error);
    }
  }

  /**
   * Clean the database (useful for testing)
   * WARNING: This will delete all data from all tables
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => key[0] !== '_' && key[0] !== '$',
    );

    return Promise.all(
      models.map((modelKey) => {
        const model = this[modelKey as keyof this];
        if (model && typeof model === 'object' && 'deleteMany' in model) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          return (model as any).deleteMany();
        }
        return Promise.resolve();
      }),
    );
  }
}
