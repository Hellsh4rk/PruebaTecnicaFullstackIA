import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CorrelatedRequest } from './express';
import { safeEqual } from './http';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const provided = request.header('x-internal-token') ?? '';
    const expected = process.env.INTERNAL_TOKEN ?? '';
    if (!expected || !provided || !safeEqual(provided, expected)) {
      throw new UnauthorizedException('Token interno inválido');
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const header = request.header('x-user-permissions') ?? '';
    const owned = header.split(',').map((item) => item.trim()).filter(Boolean);
    const allowed = required.every((permission) => owned.includes(permission));
    if (!allowed) {
      throw new ForbiddenException({ message: 'Permisos insuficientes', code: 'FORBIDDEN' });
    }
    return true;
  }
}
