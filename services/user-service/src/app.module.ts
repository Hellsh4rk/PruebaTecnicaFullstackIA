import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmqpClient, HealthController, InternalAuthGuard, JsonLogger, PermissionsGuard } from '@toka/platform';
import { USERS } from './application/ports';
import {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  RemoveUserUseCase,
  UpdateUserUseCase,
} from './application/user.usecases';
import { UserBootstrap, UserSeeder } from './infrastructure/bootstrap';
import { UserController } from './infrastructure/http/user.controller';
import { OutboxOrm, UserOrm } from './infrastructure/persistence/entities';
import { OutboxService } from './infrastructure/persistence/outbox.service';
import { TypeOrmUserRepository } from './infrastructure/persistence/user.repository';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [UserOrm, OutboxOrm],
        synchronize: config.get<string>('TYPEORM_SYNC', 'true') === 'true',
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),
    TypeOrmModule.forFeature([UserOrm, OutboxOrm]),
  ],
  controllers: [UserController, HealthController],
  providers: [
    CreateUserUseCase,
    UpdateUserUseCase,
    GetUserUseCase,
    ListUsersUseCase,
    DeactivateUserUseCase,
    RemoveUserUseCase,
    UserSeeder,
    UserBootstrap,
    OutboxService,
    InternalAuthGuard,
    PermissionsGuard,
    { provide: JsonLogger, useFactory: () => new JsonLogger(process.env.SERVICE_NAME ?? 'user-service') },
    { provide: AmqpClient, useFactory: () => new AmqpClient(new JsonLogger(process.env.SERVICE_NAME ?? 'user-service')) },
    { provide: USERS, useClass: TypeOrmUserRepository },
  ],
})
export class AppModule {}
