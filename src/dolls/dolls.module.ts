import { Module, forwardRef } from '@nestjs/common';
import { DollsService } from './dolls.service';
import { DollsController } from './dolls.controller';
import { DollsNotificationService } from './dolls-notification.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [DatabaseModule, AuthModule, forwardRef(() => WsModule)],
  controllers: [DollsController],
  providers: [DollsService, DollsNotificationService],
  exports: [DollsService],
})
export class DollsModule {}
