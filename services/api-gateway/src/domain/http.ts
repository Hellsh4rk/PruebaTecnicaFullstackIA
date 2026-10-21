import { ForbiddenException } from '@nestjs/common';
import { CorrelatedRequest } from '@toka/platform';

export interface DownstreamUser {
  sub: string;
  email: string;
  permissions: string[];
  roles: string[];
}

export function buildDownstreamHeaders(input: {
  correlationId: string;
  traceId: string;
  internalToken: string;
  user?: DownstreamUser;
}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-internal-token': input.internalToken,
    'x-correlation-id': input.correlationId,
    'x-trace-id': input.traceId,
    'x-user-id': input.user?.sub ?? '',
    'x-user-email': input.user?.email ?? '',
    'x-user-permissions': input.user?.permissions.join(',') ?? '',
    'x-user-roles': input.user?.roles.join(',') ?? '',
  };
}

export function sessionIsCurrent(tokenVersion: number, stored: string | null): boolean {
  if (!stored) return false;
  return Number(stored) === tokenVersion;
}

export function assertPermission(user: DownstreamUser | undefined, permission: string): void {
  if (!user?.permissions.includes(permission)) {
    throw new ForbiddenException({ message: 'Permisos insuficientes', code: 'FORBIDDEN' });
  }
}

export function headersFromRequest(request: CorrelatedRequest, internalToken: string): Record<string, string> {
  return buildDownstreamHeaders({
    correlationId: request.correlationId,
    traceId: request.traceId,
    internalToken,
    user: request.user
      ? {
          sub: request.user.sub,
          email: request.user.email,
          permissions: request.user.permissions,
          roles: request.user.roles,
        }
      : undefined,
  });
}
