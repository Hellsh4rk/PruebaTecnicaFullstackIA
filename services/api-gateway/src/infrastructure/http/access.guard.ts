import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AccessClaims, JwtMeta, RedisKeys } from '@toka/contracts';
import { CorrelatedRequest, RedisClient } from '@toka/platform';
import jwt from 'jsonwebtoken';
import { sessionIsCurrent } from '../../domain/http';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisClient,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const header = request.header('authorization') ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException({ message: 'Sesión requerida', code: 'UNAUTHORIZED' });
    }
    const claims = this.verify(header.slice(7));
    const blacklisted = await this.read(RedisKeys.blacklist(claims.jti));
    if (blacklisted) throw new UnauthorizedException({ message: 'Token revocado', code: 'UNAUTHORIZED' });
    const version = await this.read(RedisKeys.tokenVersion(claims.sub));
    if (!sessionIsCurrent(claims.tv, version)) {
      throw new UnauthorizedException({ message: 'Los permisos cambiaron', code: 'AUTH_VERSION_STALE' });
    }
    request.user = claims;
    return true;
  }

  private verify(token: string): AccessClaims {
    try {
      const claims = jwt.verify(token, this.config.getOrThrow<string>('JWT_SECRET'), {
        issuer: JwtMeta.issuer,
        audience: JwtMeta.audience,
      }) as AccessClaims & { typ?: string };
      if (!claims.sub || !claims.jti || claims.typ === 'refresh') {
        throw new Error('claims');
      }
      return {
        ...claims,
        roles: claims.roles ?? [],
        permissions: claims.permissions ?? [],
      };
    } catch {
      throw new UnauthorizedException({ message: 'Token inválido', code: 'UNAUTHORIZED' });
    }
  }

  private async read(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      throw new ServiceUnavailableException({ message: 'No se pudo verificar la sesión', code: 'AUTHZ_UNAVAILABLE' });
    }
  }
}
