import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ids } from '@toka/contracts';
import { AmqpClient, JsonLogger } from '@toka/platform';
import { USERS, UserRepository } from '../application/ports';
import { CreateUserUseCase } from '../application/user.usecases';
import { OutboxService } from './persistence/outbox.service';

@Injectable()
export class UserSeeder {
  constructor(
    @Inject(USERS) private readonly users: UserRepository,
    private readonly createUser: CreateUserUseCase,
    private readonly config: ConfigService,
  ) {}

  async seed(): Promise<void> {
    const existing = await this.users.findById(Ids.adminUser);
    if (existing) return;
    await this.createUser.execute({
      id: Ids.adminUser,
      email: this.config.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@toka.local',
      fullName: this.config.get<string>('SEED_ADMIN_NAME') ?? 'Administrador Toka',
      correlationId: 'seed',
      traceId: 'seed',
    });
  }
}

@Injectable()
export class UserBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly amqp: AmqpClient,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly seeder: UserSeeder,
    private readonly logger: JsonLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    await this.seeder.seed();
    this.outbox.start();
    this.logger.event('user_ready');
  }

  async onModuleDestroy(): Promise<void> {
    this.outbox.stop();
    await this.amqp.close();
  }
}
