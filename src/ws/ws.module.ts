import { Module, forwardRef } from '@nestjs/common';
import { StateGateway } from './state/state.gateway';
import { WsNotificationService } from './state/ws-notification.service';
import { UserSocketService } from './state/user-socket.service';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { RedisModule } from '../database/redis.module';

@Module({
  imports: [AuthModule, RedisModule, forwardRef(() => FriendsModule)],
  providers: [StateGateway, WsNotificationService, UserSocketService],
  exports: [StateGateway, WsNotificationService, UserSocketService],
})
export class WsModule {}
