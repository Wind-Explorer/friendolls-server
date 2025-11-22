import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

/**
 * Validates required environment variables.
 * Throws an error if any required variables are missing or invalid.
 * Returns the validated config.
 */
function validateEnvironment(config: Record<string, any>): Record<string, any> {
  const requiredVars = ['JWKS_URI', 'JWT_ISSUER', 'JWT_AUDIENCE'];

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
    // Configure global environment variables with validation
    ConfigModule.forRoot({
      isGlobal: true, // Make ConfigService available throughout the app
      envFilePath: '.env', // Load from .env file
      validate: validateEnvironment, // Validate required environment variables
    }),
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
