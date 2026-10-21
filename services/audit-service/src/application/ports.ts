import { AuditRecord } from '../domain/audit-record';

export interface AuditQuery {
  type?: string;
  correlationId?: string;
  page?: number;
  limit?: number;
}

export interface AuditStore {
  insert(record: AuditRecord): Promise<void>;
  search(query: Required<Pick<AuditQuery, 'page' | 'limit'>> & AuditQuery): Promise<{ items: AuditRecord[]; total: number }>;
}

export const AUDIT_STORE = Symbol('AUDIT_STORE');
