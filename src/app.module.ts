import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { WsModule } from './ws/ws.module';
import { FriendsModule } from './friends/friends.module';

/**
 * Validates required environment variables.
 * Throws an error if any required variables are missing or invalid.
 * Returns the validated config.
 */
function validateEnvironment(config: Record<string, any>): Record<string, any> {
  const requiredVars = [
    'JWKS_URI',
    'JWT_ISSUER',
    'JWT_AUDIENCE',
    'DATABASE_URL',
  ];

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

  return config;
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
          ttl: config.get('THROTTLE_TTL', 60000),
          limit: config.get('THROTTLE_LIMIT', 10),
        },
      ],
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    UsersModule,
    AuthModule,
    WsModule,
    FriendsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
