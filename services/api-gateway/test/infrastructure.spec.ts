import jwt from 'jsonwebtoken';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtMeta, Permissions, RedisKeys } from '@toka/contracts';
import { FixedWindowLimiter } from '@toka/platform';
import { AccessGuard } from '../src/infrastructure/http/access.guard';
import { GatewayController } from '../src/infrastructure/http/gateway.controller';
import { ServiceProxy, writeUpstream } from '../src/infrastructure/http/proxy';
import '../src/app.module';

const secret = 'toka-dev-jwt-secret-change-me-32b';

function config() {
  const values: Record<string, string> = {
    AUTH_SERVICE_URL: 'http://auth',
    USER_SERVICE_URL: 'http://user',
    ROLE_SERVICE_URL: 'http://role',
    AUDIT_SERVICE_URL: 'http://audit',
    AI_SERVICE_URL: 'http://ai/',
    INTERNAL_TOKEN: 'internal',
    JWT_SECRET: secret,
  };
  return {
    getOrThrow: (key: string) => values[key],
    get: (key: string) => values[key],
  };
}

function response() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function request(permissions: string[]) {
  return {
    correlationId: 'c',
    traceId: 't',
    header: (name: string) => (name === 'authorization' ? 'Bearer token' : ''),
    user: {
      sub: '11111111-1111-4111-8111-111111111111',
      email: 'admin@toka.local',
      permissions,
      roles: ['ADMIN'],
      tv: 1,
      jti: 'jti',
      iat: 1,
      exp: 2,
    },
  };
}

const all = Object.values(Permissions);

describe('proxy y guardia de acceso', () => {
  it('traduce timeout, caída y JSON inválido', async () => {
    const proxy = new ServiceProxy();
    global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => '{"ok":true}' }) as unknown as typeof fetch;
    await expect(proxy.request('http://svc', { method: 'GET', headers: {} })).resolves.toEqual({ status: 200, text: '{"ok":true}' });
    (global.fetch as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('abort'), { name: 'AbortError' }));
    await expect(proxy.request('http://svc', { method: 'GET', headers: {}, timeoutMs: 5 })).resolves.toMatchObject({ status: 504 });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await expect(proxy.request('http://svc', { method: 'POST', headers: {}, body: { a: 1 } })).resolves.toMatchObject({ status: 503 });
    const ok = response();
    writeUpstream(ok as never, { status: 201, text: '{"id":"u"}' });
    expect(ok.body).toEqual({ id: 'u' });
    const broken = response();
    writeUpstream(broken as never, { status: 200, text: 'no-json' });
    expect(broken.body).toMatchObject({ code: 'UPSTREAM' });
    const empty = response();
    writeUpstream(empty as never, { status: 204, text: '' });
    expect(empty.body).toEqual({});
  });

  it('acepta la ruta pública, revoca el token y cierra si Redis falla', async () => {
    const token = jwt.sign(
      { sub: 'u', email: 'a@toka.local', roles: ['ADMIN'], permissions: ['users:read'], tv: 2, jti: 'j1' },
      secret,
      { issuer: JwtMeta.issuer, audience: JwtMeta.audience },
    );
    const redis = {
      get: jest.fn(async (key: string): Promise<string | null> => (key === RedisKeys.tokenVersion('u') ? '2' : null)),
    };
    const guard = new AccessGuard({ getAllAndOverride: jest.fn().mockReturnValueOnce(true).mockReturnValue(false) } as never, redis as never, config() as never);
    const http = {
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => ({ header: () => `Bearer ${token}`, user: undefined as unknown }) }),
    };
    await expect(guard.canActivate(http as never)).resolves.toBe(true);
    await expect(guard.canActivate(http as never)).resolves.toBe(true);
    redis.get.mockImplementation(async (key: string) => (key.startsWith('jwt:blacklist') ? '1' : '2'));
    await expect(guard.canActivate(http as never)).rejects.toBeInstanceOf(UnauthorizedException);
    redis.get.mockImplementation(async (key: string) => (key === RedisKeys.tokenVersion('u') ? '9' : null));
    await expect(guard.canActivate(http as never)).rejects.toBeInstanceOf(UnauthorizedException);
    redis.get.mockRejectedValue(new Error('redis'));
    await expect(guard.canActivate(http as never)).rejects.toBeInstanceOf(ServiceUnavailableException);
    const anonymous = {
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => ({ header: () => '' }) }),
    };
    await expect(guard.canActivate(anonymous as never)).rejects.toBeInstanceOf(UnauthorizedException);
    const refresh = jwt.sign({ sub: 'u', typ: 'refresh' }, secret, { issuer: JwtMeta.issuer, audience: JwtMeta.audience });
    const bad = {
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => ({ header: () => `Bearer ${refresh}` }) }),
    };
    await expect(guard.canActivate(bad as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('orquestación del gateway', () => {
  function build() {
    const proxy = { request: jest.fn().mockResolvedValue({ status: 200, text: '{"id":"u","email":"ana@toka.local","fullName":"Ana"}' }) };
    const http = new GatewayController(proxy as never, config() as never, new FixedWindowLimiter(1, 60_000, () => 1_000));
    return { http, proxy };
  }

  it('limita el login y compensa la saga de alta', async () => {
    const { http, proxy } = build();
    const res = response();
    await http.login({ email: 'a@toka.local', password: 'Toka2026!' }, request(all) as never, res as never, '10.0.0.1');
    expect(res.statusCode).toBe(200);
    const limited = response();
    await http.login({ email: 'a@toka.local', password: 'Toka2026!' }, request(all) as never, limited as never, '10.0.0.1');
    expect(limited.statusCode).toBe(429);
    await http.login({ email: 'a@toka.local', password: 'Toka2026!' }, request(all) as never, response() as never, '');

    proxy.request
      .mockResolvedValueOnce({ status: 400, text: '{"code":"EMAIL_TAKEN"}' });
    const failedCredential = response();
    await http.createUser(
      { email: 'ana@toka.local', fullName: 'Ana López', password: 'Operador2026!', roleId: '44444444-4444-4444-8444-444444444444' },
      request(all) as never,
      failedCredential as never,
    );
    expect(failedCredential.statusCode).toBe(400);

    proxy.request
      .mockResolvedValueOnce({ status: 201, text: '{}' })
      .mockResolvedValueOnce({ status: 500, text: '{"code":"FAIL"}' })
      .mockResolvedValueOnce({ status: 204, text: '' });
    const failedProfile = response();
    await http.createUser(
      { email: 'ana@toka.local', fullName: 'Ana López', password: 'Operador2026!', roleId: '44444444-4444-4444-8444-444444444444' },
      request(all) as never,
      failedProfile as never,
    );
    expect(failedProfile.statusCode).toBe(500);

    proxy.request
      .mockResolvedValueOnce({ status: 201, text: '{}' })
      .mockResolvedValueOnce({ status: 201, text: '{"id":"u","email":"ana@toka.local"}' })
      .mockResolvedValueOnce({ status: 409, text: '{"code":"TAKEN"}' })
      .mockResolvedValueOnce({ status: 204, text: '' })
      .mockResolvedValueOnce({ status: 204, text: '' });
    const failedRole = response();
    await http.createUser(
      { email: 'ana@toka.local', fullName: 'Ana López', password: 'Operador2026!', roleId: '44444444-4444-4444-8444-444444444444' },
      request(all) as never,
      failedRole as never,
    );
    expect(failedRole.statusCode).toBe(409);

    proxy.request
      .mockResolvedValueOnce({ status: 201, text: '{}' })
      .mockResolvedValueOnce({ status: 201, text: '{"id":"u","email":"ana@toka.local"}' })
      .mockResolvedValueOnce({ status: 201, text: '{}' });
    const created = response();
    await http.createUser(
      { email: 'ana@toka.local', fullName: 'Ana López', password: 'Operador2026!', roleId: '44444444-4444-4444-8444-444444444444' },
      request(all) as never,
      created as never,
    );
    expect(created.statusCode).toBe(201);
  });

  it('enriquece usuarios, compensa el correo y aísla al agente', async () => {
    const { http, proxy } = build();
    const meFail = response();
    proxy.request.mockResolvedValueOnce({ status: 404, text: '{"code":"NOT_FOUND"}' });
    await http.me(request(all) as never, meFail as never);
    expect(meFail.statusCode).toBe(404);
    proxy.request.mockResolvedValueOnce({ status: 200, text: '{"id":"u","email":"admin@toka.local"}' });
    const me = response();
    await http.me(request(all) as never, me as never);
    expect(me.body).toMatchObject({ roles: ['ADMIN'] });

    proxy.request.mockResolvedValueOnce({ status: 500, text: '{"code":"DOWN"}' });
    const usersFail = response();
    await http.users({ search: 'ana', page: 1, limit: 20 }, request(all) as never, usersFail as never);
    expect(usersFail.statusCode).toBe(500);
    proxy.request
      .mockResolvedValueOnce({ status: 200, text: '{"data":[{"id":"u"}],"total":1,"page":1,"limit":20}' })
      .mockResolvedValueOnce({ status: 200, text: '{"roles":["OPERATOR"]}' });
    const users = response();
    await http.users({ search: '', page: 1 }, request(all) as never, users as never);
    expect(users.body).toMatchObject({ data: [{ id: 'u', roles: ['OPERATOR'] }] });
    proxy.request
      .mockResolvedValueOnce({ status: 200, text: '{"data":[{"id":"u"}],"total":1,"page":1,"limit":20}' })
      .mockResolvedValueOnce({ status: 503, text: '{}' });
    const usersNoRole = response();
    await http.users({}, request(all) as never, usersNoRole as never);
    expect((usersNoRole.body as { data: Array<{ roles: string[] }> }).data[0].roles).toEqual([]);

    const refreshed = response();
    await http.refresh({ refreshToken: 'refresh-token-value-ok' }, request(all) as never, refreshed as never);
    const loggedOut = response();
    await http.logout('Bearer access', request(all) as never, loggedOut as never);
    await http.user('u', request(all) as never, response() as never);

    proxy.request.mockResolvedValueOnce({ status: 404, text: '{"code":"NOT_FOUND"}' });
    const missing = response();
    await http.updateUser('u', { fullName: 'Ana' }, request(all) as never, missing as never);
    expect(missing.statusCode).toBe(404);
    proxy.request
      .mockResolvedValueOnce({ status: 200, text: '{"email":"ana@toka.local","fullName":"Ana"}' })
      .mockResolvedValueOnce({ status: 400, text: '{"code":"INVALID"}' });
    const invalid = response();
    await http.updateUser('u', { fullName: 'Ana' }, request(all) as never, invalid as never);
    expect(invalid.statusCode).toBe(400);
    proxy.request
      .mockResolvedValueOnce({ status: 200, text: '{"email":"ana@toka.local","fullName":"Ana"}' })
      .mockResolvedValueOnce({ status: 200, text: '{"email":"nueva@toka.local","fullName":"Ana"}' })
      .mockResolvedValueOnce({ status: 409, text: '{"code":"TAKEN"}' })
      .mockResolvedValueOnce({ status: 200, text: '{}' });
    const reverted = response();
    await http.updateUser('u', { email: 'Nueva@toka.local' }, request(all) as never, reverted as never);
    expect(reverted.statusCode).toBe(409);
    proxy.request
      .mockResolvedValueOnce({ status: 200, text: '{"email":"ana@toka.local","fullName":"Ana"}' })
      .mockResolvedValueOnce({ status: 200, text: '{"email":"ana@toka.local","fullName":"Ana López"}' });
    await http.updateUser('u', { fullName: 'Ana López' }, request(all) as never, response() as never);

    proxy.request.mockResolvedValueOnce({ status: 200, text: '{"status":"INACTIVE"}' }).mockResolvedValueOnce({ status: 200, text: '{}' });
    const deactivated = response();
    await http.deactivate('u', request(all) as never, deactivated as never);
    expect(deactivated.statusCode).toBe(200);
    proxy.request.mockResolvedValueOnce({ status: 500, text: '{"code":"FAIL"}' });
    await http.deactivate('u', request(all) as never, response() as never);

    await http.roles(request(all) as never, response() as never);
    await http.assign({ userId: 'u', roleId: 'r' }, request(all) as never, response() as never);
    await http.revoke('u', 'r', request(all) as never, response() as never);
    await http.audit({ type: 'user.created', correlationId: 'c' }, request(all) as never, response() as never);
    await http.ai({ question: 'hola' }, request(all) as never, response() as never);
    await http.ingest({ title: 'Manual', text: 'texto', source: 'manual' }, request(all) as never, response() as never);
    await http.aiMetrics(request(all) as never, response() as never);
    expect(http.health()).toEqual({ status: 'ok', service: 'api-gateway' });
    await expect(http.users({}, request([]) as never, response() as never)).rejects.toThrow();
  });
});
