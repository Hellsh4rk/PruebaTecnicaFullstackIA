import { DomainEventEnvelope } from '@toka/contracts';
import { sanitize } from '@toka/platform';

export interface AuditRecord {
  eventId: string;
  type: string;
  aggregateId: string;
  correlationId: string;
  traceId: string;
  routingKey: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  receivedAt: Date;
}

export function toAuditRecord(
  message: Partial<DomainEventEnvelope>,
  headers: Record<string, unknown>,
  routingKey: string,
  receivedAt = new Date(),
): AuditRecord {
  if (!message.eventId || !message.aggregateId || !message.occurredAt) {
    throw new Error('Evento de auditoría incompleto');
  }
  return {
    eventId: message.eventId,
    type: message.type || routingKey,
    aggregateId: message.aggregateId,
    correlationId: stringHeader(headers.correlationId),
    traceId: stringHeader(headers.traceId),
    routingKey,
    payload: (sanitize(message.payload ?? {}) ?? {}) as Record<string, unknown>,
    occurredAt: new Date(message.occurredAt),
    receivedAt,
  };
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
}

function stringHeader(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
