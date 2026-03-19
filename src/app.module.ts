import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './database/redis.module';
import { WsModule } from './ws/ws.module';
import { FriendsModule } from './friends/friends.module';
import { DollsModule } from './dolls/dolls.module';

/**
 * Validates required environment variables.
 * Throws an error if any required variables are missing or invalid.
 * Returns the validated config.
 */
function validateEnvironment(config: Record<string, any>): Record<string, any> {
  const requiredVars = ['JWT_SECRET', 'DATABASE_URL'];

  const missingVars = requiredVars.filter((varName) => !config[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
  }

  // Validate PORT if provided
  if (config.PORT && isNaN(Number(config.PORT))) {
    throw new Error('PORT must be a valid number');
  }

  validateOptionalProvider(config, 'GOOGLE');
  validateOptionalProvider(config, 'DISCORD');

  return config;
}

function validateOptionalProvider(
  config: Record<string, any>,
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL', 1000),
          limit: config.get('THROTTLE_LIMIT', 5),
        },
      ],
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
