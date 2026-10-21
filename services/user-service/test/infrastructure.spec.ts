import { User } from '../src/domain/user';
import { UserController } from '../src/infrastructure/http/user.controller';
import { TypeOrmUserRepository } from '../src/infrastructure/persistence/user.repository';
import { OutboxService } from '../src/infrastructure/persistence/outbox.service';
import { UserSeeder } from '../src/infrastructure/bootstrap';
import '../src/app.module';
import '../src/infrastructure/persistence/entities';
import '../src/infrastructure/http/dto';

const meta = { correlationId: 'c', traceId: 't' };

function row(id = '11111111-1111-4111-8111-111111111111') {
  return {
    id,
    email: 'ana@toka.local',
    fullName: 'Ana López',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('persistencia y HTTP de usuarios', () => {
  it('busca, guarda y compensa el flush del outbox', async () => {
    const query = {
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[row()], 1]),
    };
    const rows = {
      findOne: jest.fn().mockResolvedValue(row()),
      createQueryBuilder: jest.fn().mockReturnValue(query),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const manager = { save: jest.fn(), delete: jest.fn() };
    const dataSource = { transaction: jest.fn(async (work: (current: typeof manager) => Promise<void>) => work(manager)) };
    const outbox = { append: jest.fn(), flush: jest.fn().mockRejectedValueOnce(new Error('rabbit')).mockResolvedValue(undefined) };
    const repository = new TypeOrmUserRepository(rows as never, dataSource as never, outbox as never);
    await expect(repository.findById(row().id)).resolves.toBeInstanceOf(User);
    rows.findOne.mockResolvedValueOnce(null);
    await expect(repository.findByEmail('missing@toka.local')).resolves.toBeNull();
    await expect(repository.search({ search: 'ana%', page: 1, limit: 20 })).resolves.toMatchObject({ total: 1 });
    await repository.search({ page: 2, limit: 10 });
    const user = User.create({ id: row().id, email: 'ana@toka.local', fullName: 'Ana López' });
    await repository.save(user, meta);
    await repository.remove(user, meta);
    expect(outbox.append).toHaveBeenCalled();
    expect(manager.delete).toHaveBeenCalled();
  });

  it('publica el outbox y el controlador delega el CRUD', async () => {
    const rows = { find: jest.fn().mockResolvedValue([]), update: jest.fn(), save: jest.fn() };
    const dataSource = { transaction: jest.fn(async (work: (manager: { save: jest.Mock }) => Promise<void>) => work({ save: jest.fn() })), query: jest.fn() };
    const outbox = new OutboxService(rows as never, dataSource as never, { publish: jest.fn() } as never);
    await outbox.append(
      { save: jest.fn() } as never,
      { eventId: 'e', type: 'user.created', aggregateId: 'u', occurredAt: new Date().toISOString(), payload: {} },
      meta,
    );
    await outbox.flush();
    outbox.start();
    outbox.stop();

    const useCases = {
      create: { execute: jest.fn().mockResolvedValue({ id: 'u' }) },
      update: { execute: jest.fn() },
      get: { execute: jest.fn() },
      list: { execute: jest.fn() },
      deactivate: { execute: jest.fn() },
      remove: { execute: jest.fn() },
    };
    const http = new UserController(
      useCases.create as never,
      useCases.update as never,
      useCases.get as never,
      useCases.list as never,
      useCases.deactivate as never,
      useCases.remove as never,
      dataSource as never,
    );
    const request = { correlationId: 'c', traceId: 't' };
    await http.create({ id: 'u', email: 'ana@toka.local', fullName: 'Ana López' }, request as never);
    await http.list({ page: 1, limit: 20 });
    await http.get('u');
    await http.update('u', { fullName: 'Ana' }, request as never);
    await http.deactivate('u', request as never);
    await http.remove('u', request as never);
    await expect(http.ready()).resolves.toEqual({ status: 'ready', service: 'user-service' });

    const users = { findById: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({}) };
    const seeder = new UserSeeder(users as never, useCases.create as never, { get: () => 'Ana' } as never);
    await seeder.seed();
    await seeder.seed();
    expect(useCases.create.execute).toHaveBeenCalled();
  });
});
