import { Credential, assertPasswordPolicy } from '../src/domain/credential';
import { LoginUseCase } from '../src/application/login.usecase';
import {
  ChangeCredentialEmailUseCase,
  DeleteCredentialUseCase,
  DisableCredentialUseCase,
  LogoutUseCase,
  RegisterCredentialUseCase,
  RefreshUseCase,
} from '../src/application/session.usecases';
import { DomainError } from '@toka/platform';

describe('Credential', () => {
  it('rechaza correos y contraseñas débiles', () => {
    expect(() => Credential.create({ id: '1', userId: '2', email: 'mal', passwordHash: 'x' })).toThrow(DomainError);
    expect(() => assertPasswordPolicy('corta', 'ana@toka.local')).toThrow('mayúscula');
    expect(() => assertPasswordPolicy('AnaToka123', 'ana@toka.local')).toThrow('correo');
  });

  it('deshabilita una credencial activa', () => {
    const credential = Credential.create({
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'Admin@Toka.local',
      passwordHash: 'hash',
    });
    expect(credential.emailAddress).toBe('admin@toka.local');
    credential.disable();
    expect(() => credential.ensureActive()).toThrow('deshabilitada');
    credential.changeEmail('otro@toka.local');
    expect(credential.emailAddress).toBe('otro@toka.local');
  });
});

describe('LoginUseCase', () => {
  const credential = Credential.create({
    id: '22222222-2222-4222-8222-222222222222',
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'admin@toka.local',
    passwordHash: 'hash',
  });

  function build(overrides: Partial<{ verify: boolean }> = {}) {
    const credentials = { findByEmail: jest.fn().mockResolvedValue(credential), findByUserId: jest.fn(), save: jest.fn(), deleteByUserId: jest.fn() };
    const hasher = { hash: jest.fn(), verify: jest.fn().mockResolvedValue(overrides.verify ?? true) };
    const access = {
      resolve: jest.fn().mockResolvedValue({ userId: credential.userId, roles: ['ADMIN'], roleIds: [], permissions: ['users:read'] }),
      beginSession: jest.fn().mockResolvedValue(3),
      currentVersion: jest.fn(),
    };
    const tokens = {
      issue: jest.fn().mockReturnValue({ accessToken: 'access', expiresIn: 900, jti: 'jti-1' }),
      issueRefresh: jest.fn().mockReturnValue('refresh'),
      verify: jest.fn(),
      verifyRefresh: jest.fn(),
    };
    const sessions = { saveRefresh: jest.fn(), assertRefresh: jest.fn(), revoke: jest.fn(), blacklist: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new LoginUseCase(credentials, hasher, access, tokens, sessions, audit);
    return { useCase, credentials, hasher, access, tokens, sessions, audit };
  }

  it('emite tokens cuando la contraseña es válida', async () => {
    const { useCase, tokens, sessions, audit } = build();
    const result = await useCase.execute({
      email: 'admin@toka.local',
      password: 'Admin123!',
      correlationId: 'c1',
      traceId: 't1',
    });
    expect(result.accessToken).toBe('access');
    expect(tokens.issue).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 3, roles: ['ADMIN'] }));
    expect(sessions.saveRefresh).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('no revela si el usuario existe', async () => {
    const { useCase, credentials } = build();
    credentials.findByEmail.mockResolvedValue(null);
    await expect(
      useCase.execute({ email: 'no@toka.local', password: 'Admin123!', correlationId: 'c', traceId: 't' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('sigue el login si la auditoría falla', async () => {
    const { useCase, audit } = build();
    audit.record.mockRejectedValueOnce(new Error('rabbit')).mockRejectedValueOnce('broker');
    await expect(
      useCase.execute({ email: 'admin@toka.local', password: 'Admin123!', correlationId: 'c', traceId: 't' }),
    ).resolves.toMatchObject({ accessToken: 'access' });
    await expect(
      useCase.execute({ email: 'admin@toka.local', password: 'Admin123!', correlationId: 'c', traceId: 't' }),
    ).resolves.toMatchObject({ accessToken: 'access' });
  });

  it('rechaza una contraseña incorrecta', async () => {
    const { useCase } = build({ verify: false });
    await expect(
      useCase.execute({ email: 'admin@toka.local', password: 'Admin123!', correlationId: 'c', traceId: 't' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('credenciales y sesión', () => {
  it('registra, refresca y deshabilita de forma idempotente', async () => {
    const stored: { current: Credential | null } = { current: null };
    const credentials = {
      findByEmail: jest.fn(async (email: string) => (stored.current?.emailAddress === email.trim().toLowerCase() ? stored.current : null)),
      findByUserId: jest.fn(async (userId: string) => (stored.current?.userId === userId ? stored.current : null)),
      save: jest.fn(async (credential: Credential) => {
        stored.current = credential;
      }),
      deleteByUserId: jest.fn(),
    };
    const hasher = { hash: jest.fn().mockResolvedValue('hash'), verify: jest.fn() };
    const register = new RegisterCredentialUseCase(credentials, hasher);
    await register.execute({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'new@toka.local',
      password: 'Admin123!',
    });
    await expect(
      register.execute({ userId: '11111111-1111-4111-8111-111111111111', email: 'new@toka.local', password: 'Admin123!' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });

    const sessions = {
      saveRefresh: jest.fn(),
      assertRefresh: jest.fn(),
      revoke: jest.fn(),
      blacklist: jest.fn(),
    };
    const disable = new DisableCredentialUseCase(credentials, sessions);
    await disable.execute(stored.current!.userId);
    expect(sessions.revoke).toHaveBeenCalledTimes(1);
    await disable.execute(stored.current!.userId);
    expect(sessions.revoke).toHaveBeenCalledTimes(1);

    const access = {
      resolve: jest.fn().mockResolvedValue({ userId: stored.current!.userId, roles: ['VIEWER'], roleIds: [], permissions: [] }),
      beginSession: jest.fn(),
      currentVersion: jest.fn().mockResolvedValue(4),
    };
    const tokens = {
      issue: jest.fn().mockReturnValue({ accessToken: 'next', expiresIn: 900, jti: 'j2' }),
      issueRefresh: jest.fn().mockReturnValue('refresh-2'),
      verify: jest.fn(),
      verifyRefresh: jest.fn().mockReturnValue({ sub: stored.current!.userId }),
    };
    stored.current = Credential.rehydrate({
      id: stored.current!.id,
      userId: stored.current!.userId,
      email: 'new@toka.local',
      passwordHash: 'hash',
      status: 'ACTIVE',
    });
    const refresh = new RefreshUseCase(credentials, access, tokens, sessions);
    await expect(refresh.execute({ refreshToken: 'old' })).resolves.toMatchObject({ accessToken: 'next' });
    tokens.verifyRefresh.mockImplementation(() => {
      throw new Error('jwt');
    });
    await expect(refresh.execute({ refreshToken: 'bad' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    credentials.findByUserId.mockResolvedValueOnce(null);
    tokens.verifyRefresh.mockReturnValue({ sub: 'missing' });
    await expect(refresh.execute({ refreshToken: 'orphan' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('cierra sesión aunque la auditoría falle y rota el correo', async () => {
    const credential = Credential.create({
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'admin@toka.local',
      passwordHash: 'hash',
    });
    const other = Credential.create({
      id: '99999999-9999-4999-8999-999999999999',
      userId: '99999999-9999-4999-8999-999999999998',
      email: 'otro@toka.local',
      passwordHash: 'hash',
    });
    const credentials = {
      findByEmail: jest.fn(async (email: string) => (email === other.emailAddress ? other : null)),
      findByUserId: jest.fn(async (userId: string) => (userId === credential.userId ? credential : null)),
      save: jest.fn(),
      deleteByUserId: jest.fn(),
    };
    const sessions = { saveRefresh: jest.fn(), assertRefresh: jest.fn(), revoke: jest.fn(), blacklist: jest.fn() };
    const tokens = {
      issue: jest.fn(),
      issueRefresh: jest.fn(),
      verify: jest.fn().mockReturnValue({ sub: credential.userId, email: credential.emailAddress, jti: 'jti', exp: 10 }),
      verifyRefresh: jest.fn(),
    };
    const audit = { record: jest.fn().mockRejectedValue(new Error('mongo')) };
    const logout = new LogoutUseCase(tokens, sessions, audit);
    await expect(logout.execute({ accessToken: 'access', correlationId: 'c', traceId: 't' })).resolves.toEqual({ revoked: true });
    audit.record.mockResolvedValue(undefined);
    await expect(logout.execute({ accessToken: 'access', correlationId: 'c', traceId: 't' })).resolves.toEqual({ revoked: true });

    const change = new ChangeCredentialEmailUseCase(credentials);
    await expect(change.execute({ userId: 'missing', email: 'nuevo@toka.local' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(change.execute({ userId: credential.userId, email: 'otro@toka.local' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(change.execute({ userId: credential.userId, email: 'nuevo@toka.local' })).resolves.toMatchObject({
      email: 'nuevo@toka.local',
    });

    const remove = new DeleteCredentialUseCase(credentials, sessions);
    await expect(remove.execute(credential.userId)).resolves.toEqual({ deleted: true });
    expect(credentials.deleteByUserId).toHaveBeenCalledWith(credential.userId);

    const disable = new DisableCredentialUseCase(credentials, sessions);
    credentials.findByUserId.mockResolvedValueOnce(null);
    await expect(disable.execute('missing')).resolves.toEqual({ disabled: true, idempotent: true });
  });
});
