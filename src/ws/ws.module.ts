import { Module } from '@nestjs/common';
import { StateGateway } from './state/state.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [StateGateway],
})
export class WsModule {}
