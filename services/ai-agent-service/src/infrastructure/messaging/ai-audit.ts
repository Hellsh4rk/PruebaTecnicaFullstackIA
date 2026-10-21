import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventEnvelope, RoutingKeys } from '@toka/contracts';
import { AmqpClient } from '@toka/platform';
import { AiAudit } from '../../application/ports';

@Injectable()
export class RabbitAiAudit implements AiAudit {
  private ready = false;

  constructor(
    private readonly amqp: AmqpClient,
    private readonly config: ConfigService,
  ) {}

  async connect(): Promise<void> {
    await this.amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    this.ready = true;
  }

  async record(payload: Record<string, unknown>, meta: { correlationId: string; traceId: string }): Promise<void> {
    if (!this.ready) return;
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type: RoutingKeys.AiQueryCompleted,
      aggregateId: String(payload.userId ?? 'anonymous'),
      occurredAt: new Date().toISOString(),
      payload,
    };
    await this.amqp.publish(RoutingKeys.AiQueryCompleted, envelope, {
      eventId: envelope.eventId,
      correlationId: meta.correlationId,
      traceId: meta.traceId,
      type: envelope.type,
    });
  }
}
