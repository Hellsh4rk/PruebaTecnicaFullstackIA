import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmqpClient, HealthController, InternalAuthGuard, JsonLogger, PermissionsGuard, RedisClient } from '@toka/platform';
import { ACCESS_CACHE, ROLES } from './application/ports';
import { AssignRoleUseCase, GetAccessUseCase, ListRolesUseCase, RevokeRoleUseCase } from './application/role.usecases';
import { RoleBootstrap, RoleSeeder } from './infrastructure/bootstrap';
import { RedisAccessCache } from './infrastructure/cache/access.cache';
import { RoleController } from './infrastructure/http/role.controller';
import { AssignmentOrm, OutboxOrm, PermissionOrm, RoleOrm } from './infrastructure/persistence/entities';
import { OutboxService } from './infrastructure/persistence/outbox.service';
import { TypeOrmRoleRepository } from './infrastructure/persistence/role.repository';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [PermissionOrm, RoleOrm, AssignmentOrm, OutboxOrm],
        synchronize: config.get<string>('TYPEORM_SYNC', 'true') === 'true',
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),
    TypeOrmModule.forFeature([PermissionOrm, RoleOrm, AssignmentOrm, OutboxOrm]),
  ],
  controllers: [RoleController, HealthController],
  providers: [
    ListRolesUseCase,
    GetAccessUseCase,
    AssignRoleUseCase,
    RevokeRoleUseCase,
    RoleSeeder,
    RoleBootstrap,
    OutboxService,
    InternalAuthGuard,
    PermissionsGuard,
    { provide: JsonLogger, useFactory: () => new JsonLogger(process.env.SERVICE_NAME ?? 'role-service') },
    { provide: RedisClient, inject: [ConfigService], useFactory: (config: ConfigService) => new RedisClient(config.getOrThrow('REDIS_URL')) },
    { provide: AmqpClient, useFactory: () => new AmqpClient(new JsonLogger(process.env.SERVICE_NAME ?? 'role-service')) },
    { provide: ROLES, useClass: TypeOrmRoleRepository },
    { provide: ACCESS_CACHE, useClass: RedisAccessCache },
  ],
})
export class AppModule {}
