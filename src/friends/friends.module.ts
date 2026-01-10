import { Module, forwardRef } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { FriendsNotificationService } from './friends-notification.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    forwardRef(() => WsModule),
  ],
  controllers: [FriendsController],
  providers: [FriendsService, FriendsNotificationService],
  exports: [FriendsService],
})
export class FriendsModule {}
