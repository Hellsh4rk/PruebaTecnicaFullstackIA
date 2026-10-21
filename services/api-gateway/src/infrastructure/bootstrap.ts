import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JsonLogger, RedisClient } from '@toka/platform';

@Injectable()
export class GatewayBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly redis: RedisClient,
    private readonly logger: JsonLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
    this.logger.event('gateway_ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
