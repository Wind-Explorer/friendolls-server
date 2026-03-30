import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { parsePositiveInteger } from '../config/env.utils';

const DEFAULT_CACHE_KEY_PREFIX = 'friendolls';
const DEFAULT_CACHE_TTL_SECONDS = 60;
const DEFAULT_CACHE_MAX_TTL_SECONDS = 86_400;
const DEFAULT_CACHE_METRICS_LOG_INTERVAL_MS = 60_000;

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds: number;
  private readonly maxTtlSeconds: number;
  private readonly metricsLogIntervalMs: number;

  private readonly metrics = {
    getHits: 0,
    getMisses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    unavailable: 0,
  };

  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {
    this.keyPrefix =
      this.configService.get<string>('CACHE_KEY_PREFIX') ||
      DEFAULT_CACHE_KEY_PREFIX;
    this.defaultTtlSeconds = parsePositiveInteger(
      this.configService.get<string>('CACHE_DEFAULT_TTL_SECONDS'),
      DEFAULT_CACHE_TTL_SECONDS,
    );
    this.maxTtlSeconds = parsePositiveInteger(
      this.configService.get<string>('CACHE_MAX_TTL_SECONDS'),
      DEFAULT_CACHE_MAX_TTL_SECONDS,
    );
    this.metricsLogIntervalMs = parsePositiveInteger(
      this.configService.get<string>('CACHE_METRICS_LOG_INTERVAL_MS'),
      DEFAULT_CACHE_METRICS_LOG_INTERVAL_MS,
    );

    if (this.metricsLogIntervalMs > 0) {
      this.metricsTimer = setInterval(() => {
        this.flushMetrics();
      }, this.metricsLogIntervalMs);
      this.metricsTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    this.flushMetrics();
  }

  getNamespacedKey(namespace: string, key: string): string {
    return `${this.keyPrefix}:${namespace}:${key}`;
  }

  resolveTtlSeconds(ttlSeconds?: number): number {
    if (ttlSeconds === undefined) {
      return this.defaultTtlSeconds;
    }

    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return this.defaultTtlSeconds;
    }

    return Math.min(Math.floor(ttlSeconds), this.maxTtlSeconds);
  }

  async get(key: string): Promise<string | null> {
    if (!this.redisClient) {
      this.metrics.unavailable += 1;
      return null;
    }

    try {
      const value = await this.redisClient.get(key);
      if (value === null) {
        this.metrics.getMisses += 1;
      } else {
        this.metrics.getHits += 1;
      }
      return value;
    } catch (error) {
      this.metrics.errors += 1;
      this.logger.warn(`Cache get failed for key ${key}`, error as Error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.redisClient) {
      this.metrics.unavailable += 1;
      return false;
    }

    try {
      const ttl = this.resolveTtlSeconds(ttlSeconds);
      await this.redisClient.set(key, value, 'EX', ttl);
      this.metrics.sets += 1;
      return true;
    } catch (error) {
      this.metrics.errors += 1;
      this.logger.warn(`Cache set failed for key ${key}`, error as Error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.redisClient) {
      this.metrics.unavailable += 1;
      return false;
    }

    try {
      await this.redisClient.del(key);
      this.metrics.deletes += 1;
      return true;
    } catch (error) {
      this.metrics.errors += 1;
      this.logger.warn(`Cache delete failed for key ${key}`, error as Error);
      return false;
    }
  }

  getRedisClient(): Redis | null {
    return this.redisClient;
  }

  recordError(operation: string, key: string, error: unknown): void {
    this.metrics.errors += 1;
    this.logger.warn(
      `Cache ${operation} failed for key ${key}`,
      error as Error,
    );
  }

  recordUnavailable(): void {
    this.metrics.unavailable += 1;
  }

  private flushMetrics(): void {
    const totalReads = this.metrics.getHits + this.metrics.getMisses;

    if (
      totalReads === 0 &&
      this.metrics.sets === 0 &&
      this.metrics.deletes === 0 &&
      this.metrics.errors === 0 &&
      this.metrics.unavailable === 0
    ) {
      return;
    }

    const hitRate =
      totalReads === 0
        ? '0.00'
        : ((this.metrics.getHits / totalReads) * 100).toFixed(2);

    this.logger.log(
      `metrics reads=${totalReads} hits=${this.metrics.getHits} misses=${this.metrics.getMisses} hitRate=${hitRate}% sets=${this.metrics.sets} deletes=${this.metrics.deletes} errors=${this.metrics.errors} unavailable=${this.metrics.unavailable}`,
    );

    this.metrics.getHits = 0;
    this.metrics.getMisses = 0;
    this.metrics.sets = 0;
    this.metrics.deletes = 0;
    this.metrics.errors = 0;
    this.metrics.unavailable = 0;
  }
}
