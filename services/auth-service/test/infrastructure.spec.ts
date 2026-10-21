import { ConfigService } from '@nestjs/config';
import { DomainError } from '@toka/platform';
import { Credential } from '../src/domain/credential';
import { AuthController } from '../src/infrastructure/http/auth.controller';
import { AuthConsumer } from '../src/infrastructure/messaging/auth.consumer';
import { OutboxAuthAudit } from '../src/infrastructure/messaging/auth-audit';
import { TypeOrmCredentialRepository } from '../src/infrastructure/persistence/credential.repository';
import { OutboxService } from '../src/infrastructure/persistence/outbox.service';
import { AuthSeeder } from '../src/infrastructure/bootstrap';
import {
  BcryptHasher,
  JwtTokenService,
  RedisAccessDirectory,
  RedisSessionStore,
} from '../src/infrastructure/security/security.providers';
import '../src/app.module';
import '../src/infrastructure/persistence/entities';
import '../src/infrastructure/http/dto';

const secret = 'toka-dev-jwt-secret-change-me-32b';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(key);
      return values[key];
    },
  } as unknown as ConfigService;
}

function memoryRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
    }),
    incr: jest.fn(async (key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    }),
  };
}

describe('JWT, Redis y repositorio de credenciales', () => {
  it('emite, verifica y rechaza un refresh usado como access', () => {
    const tokens = new JwtTokenService(config({ JWT_SECRET: secret, JWT_ACCESS_TTL_SECONDS: '900' }));
    const issued = tokens.issue({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'admin@toka.local',
      roles: ['ADMIN'],
      permissions: ['users:read'],
      tokenVersion: 2,
    });
    expect(tokens.verify(issued.accessToken)).toMatchObject({ sub: '11111111-1111-4111-8111-111111111111', jti: issued.jti });
    const refresh = tokens.issueRefresh('11111111-1111-4111-8111-111111111111');
    expect(tokens.verifyRefresh(refresh).sub).toBe('11111111-1111-4111-8111-111111111111');
    expect(() => tokens.verify(refresh)).toThrow(DomainError);
    expect(() => tokens.verifyRefresh(issued.accessToken)).toThrow(DomainError);
  });

  it('resuelve permisos desde caché o desde Role y rota la versión', async () => {
    const redis = memoryRedis();
    const directory = new RedisAccessDirectory(
      redis as never,
      config({ ROLE_SERVICE_URL: 'http://role', INTERNAL_TOKEN: 'internal' }),
    );
    const snapshot = { userId: 'u1', roles: ['VIEWER'], roleIds: [], permissions: ['users:read'] };
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(directory.resolve('u1')).resolves.toEqual(snapshot);
    await expect(directory.resolve('u1')).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    redis.store.clear();
    await expect(directory.resolve('u2')).rejects.toMatchObject({ code: 'AUTHZ_UNAVAILABLE' });
    await expect(directory.beginSession('u1')).resolves.toBe(1);
    await expect(directory.currentVersion('u1')).resolves.toBe(1);
    redis.store.clear();
    await expect(directory.currentVersion('u3')).resolves.toBe(1);
  });

  it('guarda el refresh, revoca si no coincide y pone el jti en blacklist', async () => {
    const redis = memoryRedis();
    const sessions = new RedisSessionStore(redis as never, config({ JWT_REFRESH_TTL_SECONDS: '60' }));
    await sessions.saveRefresh('u1', 'refresh-token', 'jti', 'a@toka.local');
    await expect(sessions.assertRefresh('u1', 'refresh-token')).resolves.toBeUndefined();
    await expect(sessions.assertRefresh('u1', 'otro')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await sessions.blacklist('jti', Math.floor(Date.now() / 1000) + 30);
    expect(redis.set).toHaveBeenCalled();
    const hasher = new BcryptHasher();
    const hash = await hasher.hash('Toka2026!');
    await expect(hasher.verify('Toka2026!', hash)).resolves.toBe(true);
  });

  it('mapea la credencial y el outbox', async () => {
    const credential = Credential.create({
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'Admin@Toka.local',
      passwordHash: 'hash',
    });
    const rows = {
      findOne: jest.fn().mockResolvedValue({
        id: credential.id,
        userId: credential.userId,
        email: 'admin@toka.local',
        passwordHash: 'hash',
        status: 'ACTIVE',
      }),
      save: jest.fn(),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const repository = new TypeOrmCredentialRepository(rows as never);
    await expect(repository.findByEmail(' Admin@Toka.local ')).resolves.toBeInstanceOf(Credential);
    rows.findOne.mockResolvedValueOnce(null);
    await expect(repository.findByUserId('missing')).resolves.toBeNull();
    await repository.save(credential);
    await repository.deleteByUserId(credential.userId);
    expect(rows.save).toHaveBeenCalled();
    expect(rows.delete).toHaveBeenCalledWith({ userId: credential.userId });

    const dataSource = { transaction: jest.fn(async (work: (manager: { save: jest.Mock }) => Promise<void>) => work({ save: jest.fn() })) };
    const amqp = { publish: jest.fn() };
    const outbox = new OutboxService(rows as never, dataSource as never, amqp as never);
    const envelope = {
      eventId: 'e1',
      type: 'auth.logged_in',
      aggregateId: credential.userId,
      occurredAt: new Date().toISOString(),
      payload: { email: 'admin@toka.local' },
    };
    await outbox.enqueue(envelope, { correlationId: 'c', traceId: 't' });
    rows.find.mockResolvedValueOnce([
      { id: 'e1', routingKey: envelope.type, body: envelope, headers: { correlationId: 'c' } },
    ]);
    await outbox.flush();
    expect(amqp.publish).toHaveBeenCalled();
    outbox.start();
    outbox.stop();
  });
});

describe('HTTP y consumidores de Auth', () => {
  const request = { correlationId: 'c', traceId: 't' };

  function controller() {
    const useCases = {
      login: { execute: jest.fn().mockResolvedValue({ accessToken: 'a' }) },
      refresh: { execute: jest.fn().mockResolvedValue({ accessToken: 'b' }) },
      logout: { execute: jest.fn().mockResolvedValue({ revoked: true }) },
      register: { execute: jest.fn().mockResolvedValue({ userId: 'u' }) },
      change: { execute: jest.fn().mockResolvedValue({ email: 'a@toka.local' }) },
      disable: { execute: jest.fn().mockResolvedValue({ disabled: true }) },
      remove: { execute: jest.fn().mockResolvedValue({ deleted: true }) },
    };
    const dataSource = { query: jest.fn() };
    const redis = { get: jest.fn() };
    const http = new AuthController(
      useCases.login as never,
      useCases.refresh as never,
      useCases.logout as never,
      useCases.register as never,
      useCases.change as never,
      useCases.disable as never,
      useCases.remove as never,
      dataSource as never,
      redis as never,
    );
    return { http, useCases, dataSource, redis };
  }

  it('delega cada ruta y exige bearer en el logout', async () => {
    const { http, useCases, dataSource, redis } = controller();
    await http.login({ email: 'a@toka.local', password: 'Toka2026!' }, request as never);
    await http.refresh({ refreshToken: 'refresh-token-value' });
    expect(() => http.logout(undefined, request as never)).toThrow(DomainError);
    await http.logout('Bearer access', request as never);
    await http.register({ userId: 'u', email: 'a@toka.local', password: 'Toka2026!' });
    await http.changeEmail('u', { email: 'b@toka.local' });
    await http.disable('u');
    await http.remove('u');
    await expect(http.ready()).resolves.toEqual({ status: 'ready', service: 'auth-service' });
    expect(useCases.logout.execute).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access' }));
    expect(dataSource.query).toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalled();
  });

  it('deshabilita o cambia el correo según el evento y siembra una sola vez', async () => {
    const disable = { execute: jest.fn() };
    const change = { execute: jest.fn() };
    let handler: (message: unknown) => Promise<void> = async () => undefined;
    const amqp = {
      consume: jest.fn(async (_queue: string, _keys: string[], next: (message: unknown) => Promise<void>) => {
        handler = next;
      }),
    };
    const consumer = new AuthConsumer(amqp as never, disable as never, change as never);
    await consumer.start();
    await expect(handler({ type: 'user.deactivated' })).rejects.toThrow('aggregateId');
    await handler({ type: 'user.deactivated', aggregateId: 'u1' });
    await handler({ type: 'user.updated', aggregateId: 'u1', payload: { email: 'nuevo@toka.local' } });
    await handler({ type: 'user.updated', aggregateId: 'u1', payload: {} });
    expect(disable.execute).toHaveBeenCalledWith('u1');
    expect(change.execute).toHaveBeenCalledWith({ userId: 'u1', email: 'nuevo@toka.local' });

    const credentials = { findByEmail: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const seeder = new AuthSeeder(
      credentials as never,
      { hash: jest.fn().mockResolvedValue('hash') } as never,
      config({ SEED_ADMIN_EMAIL: 'admin@toka.local', SEED_ADMIN_PASSWORD: 'Toka2026!' }),
    );
    await seeder.seed();
    credentials.findByEmail.mockResolvedValue({});
    await seeder.seed();
    expect(credentials.save).toHaveBeenCalledTimes(1);

    const outbox = { enqueue: jest.fn() };
    const audit = new OutboxAuthAudit(outbox as never);
    await audit.record('auth.logged_in', 'u1', { email: 'a@toka.local' }, { correlationId: 'c', traceId: 't' });
    expect(outbox.enqueue).toHaveBeenCalled();
  });
});
