import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersCacheInvalidationService } from './users-cache-invalidation.service';
import { UsersController } from './users.controller';
import { UsersNotificationService } from './users-notification.service';
import { AuthModule } from '../auth/auth.module';
import { WsModule } from '../ws/ws.module';

/**
 * Users Module
 *
 * Manages user-related functionality including user profile management
 * and local authentication.
 *
 * The module exports UsersService to allow other modules (like AuthModule)
 * to access user data and perform synchronization.
 */
@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => WsModule)],
  providers: [
    UsersService,
    UsersNotificationService,
    UsersCacheInvalidationService,
  ],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
