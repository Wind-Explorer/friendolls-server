import { Injectable } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

const appVersion =
  process.env.APP_VERSION ?? process.env.npm_package_version ?? 'unknown';

export type DatabaseHealth = 'OK' | 'DOWN';

export interface HealthResponse {
  status: DatabaseHealth;
  version: string;
  uptimeSecs: number;
  db: DatabaseHealth;
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth(): Promise<HealthResponse> {
    const uptimeSecs = Math.floor(process.uptime());
    let db: DatabaseHealth = 'OK';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'DOWN';
    }

    const status: DatabaseHealth = db === 'OK' ? 'OK' : 'DOWN';

    return {
      status,
      version: appVersion,
      uptimeSecs,
      db,
    };
  }
}
