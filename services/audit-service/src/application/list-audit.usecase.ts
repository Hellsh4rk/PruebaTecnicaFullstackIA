import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_STORE, AuditQuery, AuditStore } from './ports';

@Injectable()
export class ListAuditUseCase {
  constructor(@Inject(AUDIT_STORE) private readonly store: AuditStore) {}

  execute(query: AuditQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    return this.store.search({ ...query, page, limit }).then((result) => ({
      data: result.items.map((item) => ({
        ...item,
        occurredAt: item.occurredAt.toISOString(),
        receivedAt: item.receivedAt.toISOString(),
      })),
      total: result.total,
      page,
      limit,
    }));
  }
}
