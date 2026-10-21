import { likeTerm, User } from '../src/domain/user';
import {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  RemoveUserUseCase,
  UpdateUserUseCase,
} from '../src/application/user.usecases';
import { UserRepository } from '../src/application/ports';
import { DomainError } from '@toka/platform';

function memory() {
  const rows = new Map<string, User>();
  const savedEvents: string[] = [];
  const repo: UserRepository = {
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async findByEmail(email) {
      const normalized = email.trim().toLowerCase();
      return [...rows.values()].find((user) => user.toJSON().email === normalized) ?? null;
    },
    async search() {
      return { items: [...rows.values()], total: rows.size };
    },
    async save(user) {
      savedEvents.push(...user.pullEvents().map((event) => event.type));
      rows.set(user.id, user);
    },
    async remove(user) {
      savedEvents.push(...user.pullEvents().map((event) => event.type));
      rows.delete(user.id);
    },
  };
  return { rows, repo, savedEvents };
}

const meta = { correlationId: 'c', traceId: 't' };

describe('User', () => {
  it('normaliza datos, publica eventos y rechaza estados inválidos', () => {
    const user = User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'Ana@Toka.local', fullName: ' Ana   López ' });
    expect(user.toJSON().email).toBe('ana@toka.local');
    expect(user.toJSON().fullName).toBe('Ana López');
    expect(user.peekEvents()).toHaveLength(1);
    user.rename('Ana López');
    expect(user.peekEvents()).toHaveLength(1);
    user.changeEmail('ana.lopez@toka.local');
    user.deactivate();
    expect(user.peekEvents().map((event) => event.type)).toEqual(['user.created', 'user.updated', 'user.deactivated']);
    expect(() => user.deactivate()).toThrow(DomainError);
    expect(() => User.create({ id: 'x', email: 'no', fullName: 'Ana' })).toThrow('Correo');
    expect(likeTerm('100%_a')).toBe('%100\\%\\_a%');
  });
});

describe('casos de uso de usuarios', () => {
  it('crea, actualiza, lista, desactiva y compensa', async () => {
    const { repo, savedEvents } = memory();
    const create = new CreateUserUseCase(repo);
    const update = new UpdateUserUseCase(repo);
    const get = new GetUserUseCase(repo);
    const list = new ListUsersUseCase(repo);
    const deactivate = new DeactivateUserUseCase(repo);
    const remove = new RemoveUserUseCase(repo);
    const id = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';

    await create.execute({ id, email: 'ana@toka.local', fullName: 'Ana López', ...meta });
    await get.execute(id);
    await expect(get.execute(other)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(create.execute({ id, email: 'ana@toka.local', fullName: 'Ana López', ...meta })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
    await create.execute({ id: other, email: 'luis@toka.local', fullName: 'Luis Pérez', ...meta });
    await expect(update.execute({ id: other, email: 'ana@toka.local', ...meta })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(update.execute({ id: '33333333-3333-4333-8333-333333333333', fullName: 'Nadie', ...meta })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await update.execute({ id, fullName: 'Ana María López', email: 'ana@toka.local', ...meta });
    const page = await list.execute({ page: 0, limit: 500 });
    expect(page.limit).toBe(100);
    expect(page.total).toBe(2);
    await deactivate.execute({ id, ...meta });
    await expect(deactivate.execute({ id, ...meta })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(remove.execute({ id: '99999999-9999-4999-8999-999999999999', ...meta })).resolves.toEqual({ removed: false });
    await expect(remove.execute({ id, ...meta })).resolves.toEqual({ removed: true });
    expect(savedEvents).toContain('user.created');
    expect(savedEvents).toContain('user.deactivated');
  });
});
