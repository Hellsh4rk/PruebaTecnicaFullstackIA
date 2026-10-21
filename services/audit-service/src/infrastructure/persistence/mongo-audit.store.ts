import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AuditRecord } from '../../domain/audit-record';
import { AuditQuery, AuditStore } from '../../application/ports';
import { AuditEvent } from './audit.schema';

@Injectable()
export class MongoAuditStore implements AuditStore {
  constructor(@InjectModel(AuditEvent.name) private readonly events: Model<AuditEvent>) {}

  async insert(record: AuditRecord): Promise<void> {
    await this.events.create(record);
  }

  async search(query: Required<Pick<AuditQuery, 'page' | 'limit'>> & AuditQuery) {
    const filter: FilterQuery<AuditEvent> = {};
    if (query.type) filter.type = query.type;
    if (query.correlationId) filter.correlationId = query.correlationId;
    const [items, total] = await Promise.all([
      this.events
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.events.countDocuments(filter),
    ]);
    return {
      total,
      items: items.map((item) => ({
        eventId: item.eventId,
        type: item.type,
        aggregateId: item.aggregateId,
        correlationId: item.correlationId,
        traceId: item.traceId,
        routingKey: item.routingKey,
        payload: item.payload,
        occurredAt: item.occurredAt,
        receivedAt: item.receivedAt,
      })),
    };
  }
}
