import { Module, forwardRef } from '@nestjs/common';
import { StateGateway } from './state/state.gateway';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [AuthModule, forwardRef(() => FriendsModule)],
  providers: [StateGateway],
  exports: [StateGateway],
})
export class WsModule {}
