import { AccessSnapshot, DomainEventEnvelope, RoleSeed } from '@toka/contracts';
import { RoleView } from '../domain/access';

export interface RequestMeta {
  correlationId: string;
  traceId: string;
}

export interface RoleRepository {
  list(): Promise<RoleView[]>;
  findById(id: string): Promise<RoleView | null>;
  ensureCatalog(roles: RoleSeed[]): Promise<void>;
  hasAssignment(userId: string, roleId: string): Promise<boolean>;
  assign(input: { id: string; userId: string; roleId: string; event: DomainEventEnvelope }, meta: RequestMeta): Promise<void>;
  revoke(input: { userId: string; roleId: string; event: DomainEventEnvelope }, meta: RequestMeta): Promise<boolean>;
  accessFor(userId: string): Promise<AccessSnapshot>;
}

export interface AccessCache {
  remember(snapshot: AccessSnapshot): Promise<void>;
  bump(userId: string): Promise<void>;
}

export const ROLES = Symbol('ROLES');
export const ACCESS_CACHE = Symbol('ACCESS_CACHE');
