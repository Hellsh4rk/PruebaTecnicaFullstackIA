import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainEventEnvelope } from '@toka/contracts';
import { AmqpClient, JsonLogger, OutboxDispatcher, OutboxMessage } from '@toka/platform';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { RequestMeta } from '../../application/ports';
import { OutboxOrm } from './entities';

@Injectable()
export class OutboxService {
  private readonly dispatcher: OutboxDispatcher;

  constructor(
    @InjectRepository(OutboxOrm) private readonly rows: Repository<OutboxOrm>,
    amqp: AmqpClient,
  ) {
    this.dispatcher = new OutboxDispatcher(amqp, new JsonLogger(process.env.SERVICE_NAME ?? 'role-service'));
  }

  async append(manager: EntityManager, envelope: DomainEventEnvelope, meta: RequestMeta): Promise<void> {
    const row = new OutboxOrm();
    row.id = envelope.eventId;
    row.routingKey = envelope.type;
    row.body = envelope;
    row.headers = {
      eventId: envelope.eventId,
      correlationId: meta.correlationId,
      traceId: meta.traceId,
      type: envelope.type,
    };
    row.createdAt = new Date(envelope.occurredAt);
    row.publishedAt = null;
    await manager.save(row);
  }

  start(): void {
    this.dispatcher.start(
      () => this.pending(),
      async (id) => {
        await this.rows.update(id, { publishedAt: new Date() });
      },
    );
  }

  stop(): void {
    this.dispatcher.stop();
  }

  async flush(): Promise<void> {
    await this.dispatcher.publishPending(await this.pending(), async (id) => {
      await this.rows.update(id, { publishedAt: new Date() });
    });
  }

  private async pending(): Promise<OutboxMessage[]> {
    const found = await this.rows.find({ where: { publishedAt: IsNull() }, order: { createdAt: 'ASC' }, take: 50 });
    return found.map((row) => ({ id: row.id, routingKey: row.routingKey, body: row.body, headers: row.headers }));
  }
}
