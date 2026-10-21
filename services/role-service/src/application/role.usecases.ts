import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RoutingKeys } from '@toka/contracts';
import { DomainError } from '@toka/platform';
import { assignmentEvent } from '../domain/access';
import { ACCESS_CACHE, AccessCache, RequestMeta, ROLES, RoleRepository } from './ports';

@Injectable()
export class ListRolesUseCase {
  constructor(@Inject(ROLES) private readonly roles: RoleRepository) {}

  execute() {
    return this.roles.list();
  }
}

@Injectable()
export class GetAccessUseCase {
  constructor(
    @Inject(ROLES) private readonly roles: RoleRepository,
    @Inject(ACCESS_CACHE) private readonly cache: AccessCache,
  ) {}

  async execute(userId: string) {
    const snapshot = await this.roles.accessFor(userId);
    await this.cache.remember(snapshot);
    return snapshot;
  }
}

@Injectable()
export class AssignRoleUseCase {
  constructor(
    @Inject(ROLES) private readonly roles: RoleRepository,
    @Inject(ACCESS_CACHE) private readonly cache: AccessCache,
  ) {}

  async execute(input: { userId: string; roleId: string } & RequestMeta) {
    const role = await this.roles.findById(input.roleId);
    if (!role) throw new DomainError('Rol no encontrado', 'NOT_FOUND');
    if (await this.roles.hasAssignment(input.userId, input.roleId)) {
      throw new DomainError('El rol ya está asignado', 'ALREADY_ASSIGNED');
    }
    await this.roles.assign(
      {
        id: randomUUID(),
        userId: input.userId,
        roleId: input.roleId,
        event: assignmentEvent({ type: RoutingKeys.RoleAssigned, userId: input.userId, role }),
      },
      input,
    );
    return this.refresh(input.userId);
  }

  private async refresh(userId: string) {
    const snapshot = await this.roles.accessFor(userId);
    await this.cache.remember(snapshot);
    await this.cache.bump(userId);
    return snapshot;
  }
}

@Injectable()
export class RevokeRoleUseCase {
  constructor(
    @Inject(ROLES) private readonly roles: RoleRepository,
    @Inject(ACCESS_CACHE) private readonly cache: AccessCache,
  ) {}

  async execute(input: { userId: string; roleId: string } & RequestMeta) {
    const role = await this.roles.findById(input.roleId);
    if (!role) throw new DomainError('Rol no encontrado', 'NOT_FOUND');
    const removed = await this.roles.revoke(
      {
        userId: input.userId,
        roleId: input.roleId,
        event: assignmentEvent({ type: RoutingKeys.RoleRevoked, userId: input.userId, role }),
      },
      input,
    );
    if (!removed) throw new DomainError('La asignación no existe', 'ASSIGNMENT_NOT_FOUND');
    const snapshot = await this.roles.accessFor(input.userId);
    await this.cache.remember(snapshot);
    await this.cache.bump(input.userId);
    return snapshot;
  }
}
