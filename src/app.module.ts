import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule, RedisThrottlerStorage } from './common/cache';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './database/redis.module';
import { WsModule } from './ws/ws.module';
import { FriendsModule } from './friends/friends.module';
import { DollsModule } from './dolls/dolls.module';
import {
  parsePositiveInteger,
  parseRedisRequired,
} from './common/config/env.utils';

/**
 * Validates required environment variables.
 * Throws an error if any required variables are missing or invalid.
 * Returns the validated config.
 */
function getOptionalEnvString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  return typeof value === 'string' ? value : undefined;
}

function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const requiredVars = ['JWT_SECRET', 'DATABASE_URL'];

  const missingVars = requiredVars.filter((varName) => !config[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
  }

  // Validate PORT if provided
  if (config.PORT !== undefined && !Number.isFinite(Number(config.PORT))) {
    throw new Error('PORT must be a valid number');
  }

  if (config.NODE_ENV === 'production') {
    if (
      typeof config.JWT_SECRET !== 'string' ||
      config.JWT_SECRET.length < 32
    ) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters in production',
      );
    }
  }

  const redisRequired = parseRedisRequired({
    nodeEnv: getOptionalEnvString(config, 'NODE_ENV'),
    redisRequired: getOptionalEnvString(config, 'REDIS_REQUIRED'),
  });

  if (redisRequired && !config.REDIS_HOST) {
    throw new Error(
      'REDIS_REQUIRED is enabled but REDIS_HOST is not configured',
    );
  }

  const redisConnectTimeout = getOptionalEnvString(
    config,
    'REDIS_CONNECT_TIMEOUT_MS',
  );
  if (
    redisConnectTimeout !== undefined &&
    (!Number.isFinite(Number(redisConnectTimeout)) ||
      Number(redisConnectTimeout) <= 0)
  ) {
    throw new Error('REDIS_CONNECT_TIMEOUT_MS must be a positive number');
  }

  validateOptionalProvider(config, 'GOOGLE');
  validateOptionalProvider(config, 'DISCORD');

  return config;
}

function validateOptionalProvider(
  config: Record<string, unknown>,
  provider: 'GOOGLE' | 'DISCORD',
): void {
  const vars = [
    `${provider}_CLIENT_ID`,
    `${provider}_CLIENT_SECRET`,
    `${provider}_CALLBACK_URL`,
  ];

  const presentVars = vars.filter((varName) => Boolean(config[varName]));

  if (presentVars.length > 0 && presentVars.length !== vars.length) {
    const missingVars = vars.filter((varName) => !config[varName]);
    throw new Error(
      `Incomplete ${provider} OAuth configuration: missing ${missingVars.join(', ')}`,
    );
  }
}

/**
 * Root Application Module
 *
 * Imports and configures all feature modules and global configuration.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    CacheModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, CacheModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (
        config: ConfigService,
        redisThrottlerStorage: RedisThrottlerStorage,
      ) => {
        const ttl = parsePositiveInteger(
          config.get<string>('THROTTLE_TTL'),
          1000,
        );
        const limit = parsePositiveInteger(
          config.get<string>('THROTTLE_LIMIT'),
          5,
        );

        return {
          storage: redisThrottlerStorage,
          throttlers: [
            {
              ttl,
              limit,
            },
          ],
        };
      },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    UsersModule,
    AuthModule,
    WsModule,
    FriendsModule,
    DollsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
