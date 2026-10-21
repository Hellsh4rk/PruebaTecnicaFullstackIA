import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FixedWindowLimiter, JsonLogger, RedisClient } from '@toka/platform';
import { AccessGuard } from './infrastructure/http/access.guard';
import { GatewayController } from './infrastructure/http/gateway.controller';
import { GatewayBootstrap } from './infrastructure/bootstrap';
import { ServiceProxy } from './infrastructure/http/proxy';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [GatewayController],
  providers: [
    ServiceProxy,
    GatewayBootstrap,
    AccessGuard,
    { provide: APP_GUARD, useExisting: AccessGuard },
    { provide: JsonLogger, useFactory: () => new JsonLogger(process.env.SERVICE_NAME ?? 'api-gateway') },
    { provide: RedisClient, inject: [ConfigService], useFactory: (config: ConfigService) => new RedisClient(config.getOrThrow('REDIS_URL')) },
    { provide: FixedWindowLimiter, useFactory: () => new FixedWindowLimiter(8, 60_000) },
  ],
})
export class AppModule {}
