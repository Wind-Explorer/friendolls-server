import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Database Module
 *
 * A global module that provides database access through PrismaService.
 * This module is marked as @Global() so PrismaService is available
 * throughout the application without needing to import DatabaseModule
 * in every feature module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
