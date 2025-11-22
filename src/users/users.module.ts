import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Users Module
 *
 * Manages user-related functionality including user profile management
 * and synchronization with Keycloak OIDC.
 *
 * The module exports UsersService to allow other modules (like AuthModule)
 * to access user data and perform synchronization.
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // Export so AuthModule can use it
})
export class UsersModule {}
