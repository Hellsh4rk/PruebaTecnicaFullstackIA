import { Ids, ROLE_CATALOG, RoutingKeys } from '@toka/contracts';
import { assignmentEvent } from '../src/domain/access';
import { RoleController } from '../src/infrastructure/http/role.controller';
import { TypeOrmRoleRepository } from '../src/infrastructure/persistence/role.repository';
import { OutboxService } from '../src/infrastructure/persistence/outbox.service';
import { RedisAccessCache } from '../src/infrastructure/cache/access.cache';
import { RoleSeeder } from '../src/infrastructure/bootstrap';
import '../src/app.module';
import '../src/infrastructure/persistence/entities';
import '../src/infrastructure/http/dto';

const meta = { correlationId: 'c', traceId: 't' };

describe('RBAC persistido', () => {
  function repository(overrides: Record<string, unknown> = {}) {
    const roles = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const permissions = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([{ code: 'users:read' }]),
      save: jest.fn(),
      create: jest.fn((input) => input),
    };
    const assignments = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
    const manager = { save: jest.fn(), delete: jest.fn() };
    const dataSource = { transaction: jest.fn(async (work: (current: typeof manager) => Promise<void>) => work(manager)), query: jest.fn() };
    const outbox = { append: jest.fn(), flush: jest.fn().mockRejectedValueOnce('rabbit').mockResolvedValue(undefined) };
    const repo = new TypeOrmRoleRepository(roles as never, permissions as never, assignments as never, dataSource as never, outbox as never);
    return { repo, roles, permissions, assignments, dataSource, outbox, ...overrides };
  }

  it('crea el catálogo, asigna, revoca y proyecta el acceso', async () => {
    const { repo, roles, permissions, assignments, outbox } = repository();
    await repo.ensureCatalog([ROLE_CATALOG[2]]);
    permissions.findOne.mockResolvedValue({ code: 'users:read' });
    roles.findOne.mockResolvedValue({ id: ROLE_CATALOG[2].id, description: '', permissions: [] });
    await repo.ensureCatalog([ROLE_CATALOG[2]]);
    roles.find.mockResolvedValue([{ id: 'r', name: 'VIEWER', description: 'lee', permissions: [{ code: 'users:read' }] }]);
    await expect(repo.list()).resolves.toEqual([
      { id: 'r', name: 'VIEWER', description: 'lee', permissions: ['users:read'] },
    ]);
    roles.findOne.mockResolvedValueOnce(null);
    await expect(repo.findById('missing')).resolves.toBeNull();
    roles.findOne.mockResolvedValue({ id: 'r', name: 'VIEWER', description: 'lee', permissions: [{ code: 'audit:read' }] });
    await expect(repo.findById('r')).resolves.toMatchObject({ name: 'VIEWER' });
    await expect(repo.hasAssignment('u', 'r')).resolves.toBe(false);
    assignments.findOne.mockResolvedValue({ id: 'a' });
    await expect(repo.hasAssignment('u', 'r')).resolves.toBe(true);

    const event = assignmentEvent({
      type: RoutingKeys.RoleAssigned,
      userId: 'u',
      role: { id: 'r', name: 'VIEWER', description: 'lee', permissions: ['users:read'] },
    });
    await repo.assign({ id: 'a', userId: 'u', roleId: 'r', event }, meta);
    assignments.findOne.mockResolvedValueOnce(null);
    await expect(repo.revoke({ userId: 'u', roleId: 'missing', event }, meta)).resolves.toBe(false);
    assignments.findOne.mockResolvedValue({ id: 'a', userId: 'u', roleId: 'r' });
    await expect(repo.revoke({ userId: 'u', roleId: 'r', event }, meta)).resolves.toBe(true);
    assignments.find.mockResolvedValueOnce([]);
    await expect(repo.accessFor('u')).resolves.toMatchObject({ roles: [] });
    assignments.find.mockResolvedValueOnce([{ roleId: 'r' }]);
    roles.find.mockResolvedValue([{ id: 'r', name: 'VIEWER', description: 'lee', permissions: [{ code: 'users:read' }] }]);
    await expect(repo.accessFor('u')).resolves.toMatchObject({ permissions: ['users:read'] });
    expect(outbox.append).toHaveBeenCalled();
  });

  it('expone el controlador, la caché y la semilla', async () => {
    const rows = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const dataSource = { transaction: jest.fn(async (work: (manager: { save: jest.Mock }) => Promise<void>) => work({ save: jest.fn() })), query: jest.fn() };
    const outbox = new OutboxService(rows as never, { publish: jest.fn() } as never);
    await outbox.append(
      { save: jest.fn() } as never,
      { eventId: 'e', type: 'role.assigned', aggregateId: 'u', occurredAt: new Date().toISOString(), payload: {} },
      meta,
    );
    await outbox.flush();
    outbox.start();
    outbox.stop();

    const useCases = {
      list: { execute: jest.fn().mockResolvedValue([]) },
      access: { execute: jest.fn().mockResolvedValue({ roles: [] }) },
      assign: { execute: jest.fn() },
      revoke: { execute: jest.fn() },
    };
    const http = new RoleController(useCases.list as never, useCases.access as never, useCases.assign as never, useCases.revoke as never, dataSource as never);
    const request = { correlationId: 'c', traceId: 't' };
    await http.list();
    await http.access('u');
    await http.assign({ userId: 'u', roleId: 'r' }, request as never);
    await http.revoke('u', 'r', request as never);
    await expect(http.ready()).resolves.toEqual({ status: 'ready', service: 'role-service' });

    const redis = { set: jest.fn(), incr: jest.fn() };
    const cache = new RedisAccessCache(redis as never);
    const snapshot = { userId: 'u', roles: ['ADMIN'], roleIds: [], permissions: ['users:read'] };
    await cache.remember(snapshot);
    await cache.bump('u');
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('u'), JSON.stringify(snapshot));
    expect(redis.incr).toHaveBeenCalled();

    const roles = { ensureCatalog: jest.fn(), hasAssignment: jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true) };
    const assign = { execute: jest.fn() };
    const seeder = new RoleSeeder(roles as never, assign as never);
    await seeder.seed();
    await seeder.seed();
    expect(assign.execute).toHaveBeenCalledWith(expect.objectContaining({ userId: Ids.adminUser, roleId: Ids.adminRole }));
  });
});
