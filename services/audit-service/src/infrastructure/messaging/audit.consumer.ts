import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Messaging } from '@toka/contracts';
import { AmqpClient, JsonLogger } from '@toka/platform';
import { isDuplicateKey, toAuditRecord } from '../../domain/audit-record';
import { MongoAuditStore } from '../persistence/mongo-audit.store';

@Injectable()
export class AuditConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new JsonLogger(process.env.SERVICE_NAME ?? 'audit-service');

  constructor(
    private readonly amqp: AmqpClient,
    private readonly config: ConfigService,
    private readonly store: MongoAuditStore,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    await this.amqp.consume(Messaging.auditQueue, ['#'], async (message, headers, routingKey) => {
      const record = toAuditRecord(message, headers, routingKey);
      try {
        await this.store.insert(record);
      } catch (error) {
        if (isDuplicateKey(error)) return;
        throw error;
      }
    });
    this.logger.event('audit_consumer_ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.amqp.close();
  }
}
