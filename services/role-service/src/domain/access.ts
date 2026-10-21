import { randomUUID } from 'crypto';
import { AccessSnapshot, DomainEventEnvelope, RoutingKeys } from '@toka/contracts';

export interface RoleView {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export function projectAccess(userId: string, roles: RoleView[]): AccessSnapshot {
  return {
    userId,
    roleIds: roles.map((role) => role.id),
    roles: roles.map((role) => role.name).sort(),
    permissions: [...new Set(roles.flatMap((role) => role.permissions))].sort(),
  };
}

export function assignmentEvent(input: {
  type: typeof RoutingKeys.RoleAssigned | typeof RoutingKeys.RoleRevoked;
  userId: string;
  role: RoleView;
}): DomainEventEnvelope {
  return {
    eventId: randomUUID(),
    type: input.type,
    aggregateId: input.userId,
    occurredAt: new Date().toISOString(),
    payload: {
      userId: input.userId,
      roleId: input.role.id,
      roleName: input.role.name,
      permissions: input.role.permissions,
    },
  };
}
