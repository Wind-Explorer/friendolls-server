import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from './database/prisma.service';

const appVersion = (() => {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
    ) as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
})();

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
