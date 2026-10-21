import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DomainEventEnvelope } from '@toka/contracts';
import { AuthAudit, RequestMeta } from '../../application/ports';
import { OutboxService } from '../persistence/outbox.service';

@Injectable()
export class OutboxAuthAudit implements AuthAudit {
  constructor(private readonly outbox: OutboxService) {}

  async record(type: string, aggregateId: string, payload: Record<string, unknown>, meta: RequestMeta): Promise<void> {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      aggregateId,
      occurredAt: new Date().toISOString(),
      payload,
    };
    await this.outbox.enqueue(envelope, meta);
  }
}
