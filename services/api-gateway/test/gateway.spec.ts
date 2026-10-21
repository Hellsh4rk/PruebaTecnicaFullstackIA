import { ForbiddenException } from '@nestjs/common';
import { CorrelatedRequest } from '@toka/platform';
import { assertPermission, buildDownstreamHeaders, headersFromRequest, sessionIsCurrent } from '../src/domain/http';

describe('contrato HTTP del gateway', () => {
  it('arma headers internos sin filtrar el JWT al dominio', () => {
    expect(
      buildDownstreamHeaders({
        correlationId: 'c',
        traceId: 't',
        internalToken: 'secret',
        user: { sub: 'u', email: 'a@toka.local', permissions: ['users:read'], roles: ['VIEWER'] },
      }),
    ).toEqual({
      'content-type': 'application/json',
      'x-internal-token': 'secret',
      'x-correlation-id': 'c',
      'x-trace-id': 't',
      'x-user-id': 'u',
      'x-user-email': 'a@toka.local',
      'x-user-permissions': 'users:read',
      'x-user-roles': 'VIEWER',
    });
  });

  it('cierra la sesión si Redis no tiene la versión del token', () => {
    expect(sessionIsCurrent(2, '2')).toBe(true);
    expect(sessionIsCurrent(2, null)).toBe(false);
    expect(sessionIsCurrent(2, '3')).toBe(false);
  });

  it('exige el permiso concreto', () => {
    expect(() => assertPermission(undefined, 'users:write')).toThrow(ForbiddenException);
    expect(() => assertPermission({ sub: 'u', email: 'a@toka.local', permissions: [], roles: [] }, 'users:write')).toThrow(
      ForbiddenException,
    );
    expect(() => assertPermission({ sub: 'u', email: 'a@toka.local', permissions: ['users:write'], roles: [] }, 'users:write')).not.toThrow();
  });

  it('proyecta headers anónimos y autenticados', () => {
    expect(buildDownstreamHeaders({ correlationId: 'c', traceId: 't', internalToken: 'secret' })['x-user-id']).toBe('');
    const authenticated = headersFromRequest(
      {
        correlationId: 'c',
        traceId: 't',
        user: {
          sub: 'u',
          email: 'a@toka.local',
          permissions: ['users:read'],
          roles: ['VIEWER'],
          tv: 1,
          jti: 'j',
          iat: 1,
          exp: 2,
        },
      } as CorrelatedRequest,
      'secret',
    );
    expect(authenticated['x-user-id']).toBe('u');
    expect(headersFromRequest({ correlationId: 'c', traceId: 't' } as CorrelatedRequest, 'secret')['x-user-email']).toBe('');
  });
});
