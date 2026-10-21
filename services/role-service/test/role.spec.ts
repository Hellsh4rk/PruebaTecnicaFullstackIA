import { Ids, RoutingKeys } from '@toka/contracts';
import { projectAccess, RoleView } from '../src/domain/access';
import { AssignRoleUseCase, GetAccessUseCase, RevokeRoleUseCase } from '../src/application/role.usecases';
import { AccessCache, RoleRepository } from '../src/application/ports';

const admin: RoleView = {
  id: Ids.adminRole,
  name: 'ADMIN',
  description: 'admin',
  permissions: ['users:read', 'roles:assign'],
};
const viewer: RoleView = {
  id: Ids.viewerRole,
  name: 'VIEWER',
  description: 'viewer',
  permissions: ['users:read', 'audit:read'],
};

function harness() {
  const assignments = new Set<string>();
  const events: string[] = [];
  const roles = new Map<string, RoleView>([
    [admin.id, admin],
    [viewer.id, viewer],
  ]);
  const repo: RoleRepository = {
    list: async () => [...roles.values()],
    findById: async (id) => roles.get(id) ?? null,
    ensureCatalog: async () => undefined,
    hasAssignment: async (userId, roleId) => assignments.has(`${userId}:${roleId}`),
    assign: async (input) => {
      assignments.add(`${input.userId}:${input.roleId}`);
      events.push(input.event.type);
    },
    revoke: async (input) => {
      const key = `${input.userId}:${input.roleId}`;
      if (!assignments.has(key)) return false;
      assignments.delete(key);
      events.push(input.event.type);
      return true;
    },
    accessFor: async (userId) => {
      const owned = [...roles.values()].filter((role) => assignments.has(`${userId}:${role.id}`));
      return projectAccess(userId, owned);
    },
  };
  const cache: AccessCache = { remember: jest.fn(), bump: jest.fn() };
  return { repo, cache, events };
}

describe('projectAccess', () => {
  it('une permisos sin duplicarlos', () => {
    const snapshot = projectAccess('user', [admin, viewer]);
    expect(snapshot.roles).toEqual(['ADMIN', 'VIEWER']);
    expect(snapshot.permissions).toEqual(['audit:read', 'roles:assign', 'users:read']);
  });
});

describe('asignación de roles', () => {
  const meta = { correlationId: 'c', traceId: 't' };

  it('asigna, consulta y revoca', async () => {
    const { repo, cache, events } = harness();
    const assign = new AssignRoleUseCase(repo, cache);
    const access = new GetAccessUseCase(repo, cache);
    const revoke = new RevokeRoleUseCase(repo, cache);
    const userId = Ids.adminUser;

    const snapshot = await assign.execute({ userId, roleId: admin.id, ...meta });
    expect(snapshot.roles).toEqual(['ADMIN']);
    await expect(assign.execute({ userId, roleId: admin.id, ...meta })).rejects.toMatchObject({ code: 'ALREADY_ASSIGNED' });
    await expect(assign.execute({ userId, roleId: '99999999-9999-4999-8999-999999999999', ...meta })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await access.execute(userId);
    const revoked = await revoke.execute({ userId, roleId: admin.id, ...meta });
    expect(revoked.roles).toEqual([]);
    await expect(revoke.execute({ userId, roleId: admin.id, ...meta })).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
    expect(events).toEqual([RoutingKeys.RoleAssigned, RoutingKeys.RoleRevoked]);
    expect(cache.bump).toHaveBeenCalledTimes(2);
  });
});
