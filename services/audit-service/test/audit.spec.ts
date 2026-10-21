import { toAuditRecord, isDuplicateKey } from '../src/domain/audit-record';
import { ListAuditUseCase } from '../src/application/list-audit.usecase';

describe('toAuditRecord', () => {
  it('sanea secretos y exige identificadores', () => {
    const record = toAuditRecord(
      {
        eventId: 'e1',
        type: 'user.created',
        aggregateId: 'u1',
        occurredAt: '2026-10-20T12:00:00.000Z',
        payload: { email: 'a@b.com', password: 'secret' },
      },
      { correlationId: 'c1', traceId: 't1' },
      'user.created',
      new Date('2026-10-20T12:00:01.000Z'),
    );
    expect(record.payload).toEqual({ email: 'a@b.com', password: '[REDACTED]' });
    expect(record.correlationId).toBe('c1');
    expect(() => toAuditRecord({}, {}, 'user.created')).toThrow('incompleto');
  });

  it('reconoce duplicados de Mongo', () => {
    expect(isDuplicateKey({ code: 11000 })).toBe(true);
    expect(isDuplicateKey(new Error('x'))).toBe(false);
  });
});

describe('ListAuditUseCase', () => {
  it('acota la página', async () => {
    const store = {
      insert: jest.fn(),
      search: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            eventId: 'e',
            type: 'user.created',
            aggregateId: 'u',
            correlationId: 'c',
            traceId: 't',
            routingKey: 'user.created',
            payload: {},
            occurredAt: new Date('2026-10-20T12:00:00.000Z'),
            receivedAt: new Date('2026-10-20T12:00:01.000Z'),
          },
        ],
      }),
    };
    const useCase = new ListAuditUseCase(store);
    const page = await useCase.execute({ page: 0, limit: 500 });
    expect(page.page).toBe(1);
    expect(page.limit).toBe(100);
    expect(page.data[0].occurredAt).toBe('2026-10-20T12:00:00.000Z');
  });
});
