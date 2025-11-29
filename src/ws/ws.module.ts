import { Module } from '@nestjs/common';
import { StateGateway } from './state/state.gateway';

@Module({
  providers: [StateGateway],
})
export class WsModule {}
