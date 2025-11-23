import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

/**
 * Authentication Module
 *
 * Provides Keycloak OpenID Connect authentication using JWT tokens.
 * This module configures:
 * - Passport for authentication strategies
 * - JWT strategy for validating Keycloak tokens
 * - Integration with UsersModule for user synchronization
 *
 * The module requires the following environment variables:
 * - JWT_ISSUER: Expected JWT issuer
 * - JWT_AUDIENCE: Expected JWT audience
 * - JWKS_URI: URI for fetching Keycloak's public keys
 */
@Module({
  imports: [
    // Import ConfigModule to access environment variables
    ConfigModule,

    // Import PassportModule for authentication strategies
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Import UsersModule to enable user synchronization (with forwardRef to avoid circular dependency)
    forwardRef(() => UsersModule),
  ],
  providers: [
    // Register the JWT strategy for validating Keycloak tokens
    JwtStrategy,

    // Register the auth service for business logic
    AuthService,
  ],
  exports: [
    // Export AuthService so other modules can use it
    AuthService,

    // Export PassportModule so guards can be used in other modules
    PassportModule,
  ],
})
export class AuthModule {}
