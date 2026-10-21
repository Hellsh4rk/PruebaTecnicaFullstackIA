import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ids, ROLE_CATALOG } from '@toka/contracts';
import { AmqpClient, JsonLogger, RedisClient } from '@toka/platform';
import { ROLES, RoleRepository } from '../application/ports';
import { AssignRoleUseCase } from '../application/role.usecases';
import { OutboxService } from './persistence/outbox.service';

@Injectable()
export class RoleSeeder {
  constructor(
    @Inject(ROLES) private readonly roles: RoleRepository,
    private readonly assignRole: AssignRoleUseCase,
  ) {}

  async seed(): Promise<void> {
    await this.roles.ensureCatalog(ROLE_CATALOG);
    const assigned = await this.roles.hasAssignment(Ids.adminUser, Ids.adminRole);
    if (assigned) return;
    await this.assignRole.execute({
      userId: Ids.adminUser,
      roleId: Ids.adminRole,
      correlationId: 'seed',
      traceId: 'seed',
    });
  }
}

@Injectable()
export class RoleBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly redis: RedisClient,
    private readonly amqp: AmqpClient,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly seeder: RoleSeeder,
    private readonly logger: JsonLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
    await this.amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    await this.seeder.seed();
    this.outbox.start();
    this.logger.event('role_ready');
  }

  async onModuleDestroy(): Promise<void> {
    this.outbox.stop();
    await this.amqp.close();
    await this.redis.quit();
  }
}
