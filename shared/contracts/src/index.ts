export const Ids = {
  adminUser: '11111111-1111-4111-8111-111111111111',
  adminCredential: '22222222-2222-4222-8222-222222222222',
  adminRole: '33333333-3333-4333-8333-333333333333',
  operatorRole: '44444444-4444-4444-8444-444444444444',
  viewerRole: '55555555-5555-4555-8555-555555555555',
} as const;

export const Permissions = {
  UsersRead: 'users:read',
  UsersWrite: 'users:write',
  RolesRead: 'roles:read',
  RolesAssign: 'roles:assign',
  AuditRead: 'audit:read',
  AiQuery: 'ai:query',
} as const;

export type PermissionCode = (typeof Permissions)[keyof typeof Permissions];

export interface RoleSeed {
  id: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}

export const ROLE_CATALOG: RoleSeed[] = [
  {
    id: Ids.adminRole,
    name: 'ADMIN',
    description: 'Administración total de identidad, auditoría y asistente.',
    permissions: Object.values(Permissions),
  },
  {
    id: Ids.operatorRole,
    name: 'OPERATOR',
    description: 'Opera usuarios y consulta el asistente.',
    permissions: [Permissions.UsersRead, Permissions.UsersWrite, Permissions.RolesRead, Permissions.AiQuery],
  },
  {
    id: Ids.viewerRole,
    name: 'VIEWER',
    description: 'Solo lectura de usuarios y auditoría.',
    permissions: [Permissions.UsersRead, Permissions.AuditRead],
  },
];

export const RoutingKeys = {
  UserCreated: 'user.created',
  UserUpdated: 'user.updated',
  UserDeactivated: 'user.deactivated',
  RoleAssigned: 'role.assigned',
  RoleRevoked: 'role.revoked',
  AuthLoggedIn: 'auth.logged_in',
  AuthLoggedOut: 'auth.logged_out',
  AiQueryCompleted: 'ai.query_completed',
} as const;

export type RoutingKey = (typeof RoutingKeys)[keyof typeof RoutingKeys];

export const Messaging = {
  exchange: 'toka.domain',
  dlx: 'toka.domain.dlx',
  auditQueue: 'audit.events',
} as const;

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  type: RoutingKey | string;
  aggregateId: string;
  occurredAt: string;
  payload: T;
}

export interface AccessSnapshot {
  userId: string;
  roles: string[];
  roleIds: string[];
  permissions: string[];
}

export const RedisKeys = {
  access: (userId: string) => `access:user:${userId}`,
  tokenVersion: (userId: string) => `token:version:${userId}`,
  blacklist: (jti: string) => `jwt:blacklist:${jti}`,
  refresh: (userId: string) => `refresh:${userId}`,
  session: (userId: string) => `session:${userId}`,
} as const;

export const JwtMeta = {
  issuer: 'toka-auth',
  audience: 'toka-bff',
} as const;

export interface AccessClaims {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  tv: number;
  jti: string;
  iat: number;
  exp: number;
}
