import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmqpClient, HealthController, InternalAuthGuard, JsonLogger, PermissionsGuard, RedisClient } from '@toka/platform';
import { LoginUseCase } from './application/login.usecase';
import {
  ACCESS,
  AUDIT,
  CREDENTIALS,
  HASHER,
  SESSIONS,
  TOKENS,
} from './application/ports';
import {
  ChangeCredentialEmailUseCase,
  DeleteCredentialUseCase,
  DisableCredentialUseCase,
  LogoutUseCase,
  RefreshUseCase,
  RegisterCredentialUseCase,
} from './application/session.usecases';
import { AuthBootstrap, AuthSeeder } from './infrastructure/bootstrap';
import { AuthController } from './infrastructure/http/auth.controller';
import { OutboxAuthAudit } from './infrastructure/messaging/auth-audit';
import { AuthConsumer } from './infrastructure/messaging/auth.consumer';
import { TypeOrmCredentialRepository } from './infrastructure/persistence/credential.repository';
import { CredentialOrm, OutboxOrm } from './infrastructure/persistence/entities';
import { OutboxService } from './infrastructure/persistence/outbox.service';
import { BcryptHasher, JwtTokenService, RedisAccessDirectory, RedisSessionStore } from './infrastructure/security/security.providers';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [CredentialOrm, OutboxOrm],
        synchronize: config.get<string>('TYPEORM_SYNC', 'true') === 'true',
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),
    TypeOrmModule.forFeature([CredentialOrm, OutboxOrm]),
  ],
  controllers: [AuthController, HealthController],
  providers: [
    LoginUseCase,
    RefreshUseCase,
    LogoutUseCase,
    RegisterCredentialUseCase,
    ChangeCredentialEmailUseCase,
    DisableCredentialUseCase,
    DeleteCredentialUseCase,
    AuthSeeder,
    AuthBootstrap,
    AuthConsumer,
    OutboxService,
    InternalAuthGuard,
    PermissionsGuard,
    { provide: JsonLogger, useFactory: () => new JsonLogger(process.env.SERVICE_NAME ?? 'auth-service') },
    { provide: RedisClient, inject: [ConfigService], useFactory: (config: ConfigService) => new RedisClient(config.getOrThrow('REDIS_URL')) },
    { provide: AmqpClient, useFactory: () => new AmqpClient(new JsonLogger(process.env.SERVICE_NAME ?? 'auth-service')) },
    { provide: CREDENTIALS, useClass: TypeOrmCredentialRepository },
    { provide: HASHER, useClass: BcryptHasher },
    { provide: TOKENS, useClass: JwtTokenService },
    { provide: ACCESS, useClass: RedisAccessDirectory },
    { provide: SESSIONS, useClass: RedisSessionStore },
    { provide: AUDIT, useClass: OutboxAuthAudit },
  ],
})
export class AppModule {}
