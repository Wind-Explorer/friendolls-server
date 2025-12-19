import { Module } from '@nestjs/common';
import { DollsService } from './dolls.service';
import { DollsController } from './dolls.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DollsController],
  providers: [DollsService],
  exports: [DollsService],
})
export class DollsModule {}
