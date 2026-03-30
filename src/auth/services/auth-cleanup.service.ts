import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import Redis from 'ioredis';
import {
  parseBoolean,
  parsePositiveInteger,
} from '../../common/config/env.utils';
import { REDIS_CLIENT } from '../../database/redis.module';

const MIN_CLEANUP_INTERVAL_MS = 60_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60_000;
const DEFAULT_REVOKED_RETENTION_DAYS = 7;
const CLEANUP_LOCK_KEY = 'lock:auth:cleanup';
const CLEANUP_LOCK_TTL_MS = 55_000;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

@Injectable()
export class AuthCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isCleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {}

  onModuleInit(): void {
    const enabled = parseBoolean(
      this.configService.get<string>('AUTH_CLEANUP_ENABLED'),
      true,
    );

    if (!enabled) {
      this.logger.log('Auth cleanup task disabled');
      return;
    }

    const configuredInterval = parsePositiveInteger(
      this.configService.get<string>('AUTH_CLEANUP_INTERVAL_MS'),
      DEFAULT_CLEANUP_INTERVAL_MS,
    );
    const cleanupIntervalMs = Math.max(
      configuredInterval,
      MIN_CLEANUP_INTERVAL_MS,
    );

    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredAuthData();
    }, cleanupIntervalMs);
    this.cleanupTimer.unref();

    void this.cleanupExpiredAuthData();
    this.logger.log(`Auth cleanup task scheduled every ${cleanupIntervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private async cleanupExpiredAuthData(): Promise<void> {
    if (this.isCleanupRunning) {
      this.logger.warn(
        'Skipping auth cleanup run because previous run is still in progress',
      );
      return;
    }

    this.isCleanupRunning = true;
    const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let lockAcquired = false;

    try {
      if (this.redisClient) {
        try {
          const lockResult = await this.redisClient.set(
            CLEANUP_LOCK_KEY,
            lockToken,
            'PX',
            CLEANUP_LOCK_TTL_MS,
            'NX',
          );
          if (lockResult !== 'OK') {
            return;
          }
          lockAcquired = true;
        } catch (error) {
          this.logger.warn(
            'Failed to acquire auth cleanup lock; running cleanup without distributed lock',
            error as Error,
          );
        }
      }

      const now = new Date();
      const revokedRetentionDays = parsePositiveInteger(
        this.configService.get<string>('AUTH_SESSION_REVOKED_RETENTION_DAYS'),
        DEFAULT_REVOKED_RETENTION_DAYS,
      );
      const revokedCutoff = new Date(
        now.getTime() - revokedRetentionDays * 24 * 60 * 60 * 1000,
      );

      const [codes, sessions] = await Promise.all([
        this.prisma.authExchangeCode.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }],
          },
        }),
        this.prisma.authSession.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { revokedAt: { lt: revokedCutoff } },
            ],
          },
        }),
      ]);

      const totalDeleted = codes.count + sessions.count;

      if (totalDeleted > 0) {
        this.logger.log(
          `Auth cleanup removed ${totalDeleted} records (${codes.count} exchange codes, ${sessions.count} sessions)`,
        );
      }
    } catch (error) {
      this.logger.error('Auth cleanup task failed', error as Error);
    } finally {
      if (lockAcquired && this.redisClient) {
        try {
          await this.redisClient.eval(
            RELEASE_LOCK_SCRIPT,
            1,
            CLEANUP_LOCK_KEY,
            lockToken,
          );
        } catch (error) {
          this.logger.warn(
            'Failed to release auth cleanup lock',
            error as Error,
          );
        }
      }

      this.isCleanupRunning = false;
    }
  }
}
