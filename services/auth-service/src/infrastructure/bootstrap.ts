import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ids } from '@toka/contracts';
import { AmqpClient, JsonLogger, RedisClient } from '@toka/platform';
import { assertPasswordPolicy, Credential } from '../domain/credential';
import { CREDENTIALS, CredentialRepository, HASHER, PasswordHasher } from '../application/ports';
import { OutboxService } from './persistence/outbox.service';
import { AuthConsumer } from './messaging/auth.consumer';

@Injectable()
export class AuthSeeder {
  constructor(
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(HASHER) private readonly hasher: PasswordHasher,
    private readonly config: ConfigService,
  ) {}

  async seed(): Promise<void> {
    const email = this.config.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@toka.local';
    const existing = await this.credentials.findByEmail(email);
    if (existing) return;
    const password = this.config.get<string>('SEED_ADMIN_PASSWORD') ?? 'Toka2026!';
    assertPasswordPolicy(password, email);
    await this.credentials.save(
      Credential.create({
        id: Ids.adminCredential,
        userId: Ids.adminUser,
        email,
        passwordHash: await this.hasher.hash(password),
      }),
    );
  }
}

@Injectable()
export class AuthBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly redis: RedisClient,
    private readonly amqp: AmqpClient,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly seeder: AuthSeeder,
    private readonly consumer: AuthConsumer,
    private readonly logger: JsonLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
    await this.amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    await this.seeder.seed();
    this.outbox.start();
    await this.consumer.start();
    this.logger.event('auth_ready');
  }

  async onModuleDestroy(): Promise<void> {
    this.outbox.stop();
    await this.amqp.close();
    await this.redis.quit();
  }
}
