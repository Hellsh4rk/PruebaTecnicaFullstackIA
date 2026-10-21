import { AuditConsumer } from '../src/infrastructure/messaging/audit.consumer';
import { AuditController } from '../src/infrastructure/http/audit.controller';
import { MongoAuditStore } from '../src/infrastructure/persistence/mongo-audit.store';
import '../src/app.module';
import '../src/infrastructure/persistence/audit.schema';

const record = {
  eventId: 'e1',
  type: 'user.created',
  aggregateId: 'u1',
  correlationId: 'c1',
  traceId: 't1',
  routingKey: 'user.created',
  payload: { email: 'ana@toka.local' },
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  receivedAt: new Date('2026-01-01T00:00:01.000Z'),
};

describe('Mongo y consumidor de auditoría', () => {
  it('inserta, filtra y confirma el ready', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([record]),
    };
    const events = {
      create: jest.fn(),
      find: jest.fn().mockReturnValue(chain),
      countDocuments: jest.fn().mockResolvedValue(1),
    };
    const store = new MongoAuditStore(events as never);
    await store.insert(record);
    await expect(store.search({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1 });
    await store.search({ page: 1, limit: 10, type: 'user.created', correlationId: 'c1' });
    expect(events.find).toHaveBeenCalledWith({ type: 'user.created', correlationId: 'c1' });

    const list = { execute: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const ready = new AuditController(list as never, { readyState: 1 } as never);
    await expect(ready.list({ page: 1 })).resolves.toEqual({ items: [], total: 0 });
    await expect(ready.ready()).resolves.toEqual({ status: 'ready', service: 'audit-service' });
    const down = new AuditController(list as never, { readyState: 0 } as never);
    await expect(down.ready()).rejects.toThrow('Mongo no está listo');
  });

  it('confirma el evento, ignora el duplicado y reintenta el resto', async () => {
    let handler: (message: unknown, headers: Record<string, unknown>, routingKey: string) => Promise<void> = async () => undefined;
    const amqp = {
      connect: jest.fn(),
      close: jest.fn(),
      consume: jest.fn(async (_queue: string, _keys: string[], next: typeof handler) => {
        handler = next;
      }),
    };
    const store = { insert: jest.fn() };
    const consumer = new AuditConsumer(amqp as never, { getOrThrow: () => 'amqp://localhost' } as never, store as never);
    await consumer.onModuleInit();
    const message = { eventId: 'e1', aggregateId: 'u1', occurredAt: new Date().toISOString(), type: 'user.created', payload: {} };
    await handler(message, { correlationId: 'c', traceId: 't' }, 'user.created');
    store.insert.mockRejectedValueOnce({ code: 11000 });
    await handler(message, {}, 'user.created');
    store.insert.mockRejectedValueOnce(new Error('mongo'));
    await expect(handler(message, { correlationId: 1 }, 'user.created')).rejects.toThrow('mongo');
    await consumer.onModuleDestroy();
    expect(amqp.close).toHaveBeenCalled();
  });
});
