import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RoutingKeys } from '@toka/contracts';
import { DomainError } from '@toka/platform';
import { assertPasswordPolicy, Credential } from '../domain/credential';
import {
  ACCESS,
  AUDIT,
  CREDENTIALS,
  HASHER,
  SESSIONS,
  TOKENS,
  AccessDirectory,
  AuthAudit,
  CredentialRepository,
  PasswordHasher,
  RequestMeta,
  SessionStore,
  TokenIssuer,
} from './ports';

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(ACCESS) private readonly access: AccessDirectory,
    @Inject(TOKENS) private readonly tokens: TokenIssuer,
    @Inject(SESSIONS) private readonly sessions: SessionStore,
  ) {}

  async execute(input: { refreshToken: string }) {
    let userId = '';
    try {
      userId = this.tokens.verifyRefresh(input.refreshToken).sub;
    } catch {
      throw new DomainError('Sesión inválida', 'UNAUTHORIZED');
    }
    const credential = await this.credentials.findByUserId(userId);
    if (!credential) throw new DomainError('Sesión inválida', 'UNAUTHORIZED');
    credential.ensureActive();
    await this.sessions.assertRefresh(credential.userId, input.refreshToken);
    const snapshot = await this.access.resolve(credential.userId);
    const tokenVersion = await this.access.currentVersion(credential.userId);
    const issued = this.tokens.issue({
      userId: credential.userId,
      email: credential.emailAddress,
      roles: snapshot.roles,
      permissions: snapshot.permissions,
      tokenVersion,
    });
    const refreshToken = this.tokens.issueRefresh(credential.userId);
    await this.sessions.saveRefresh(credential.userId, refreshToken, issued.jti, credential.emailAddress);
    return {
      accessToken: issued.accessToken,
      refreshToken,
      expiresIn: issued.expiresIn,
      user: {
        id: credential.userId,
        email: credential.emailAddress,
        roles: snapshot.roles,
        permissions: snapshot.permissions,
      },
    };
  }
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(TOKENS) private readonly tokens: TokenIssuer,
    @Inject(SESSIONS) private readonly sessions: SessionStore,
    @Inject(AUDIT) private readonly audit: AuthAudit,
  ) {}

  async execute(input: { accessToken: string } & RequestMeta) {
    const claims = this.tokens.verify(input.accessToken);
    await this.sessions.blacklist(claims.jti, claims.exp);
    await this.sessions.revoke(claims.sub);
    try {
      await this.audit.record(RoutingKeys.AuthLoggedOut, claims.sub, { email: claims.email }, input);
    } catch {
      return { revoked: true };
    }
    return { revoked: true };
  }
}

@Injectable()
export class RegisterCredentialUseCase {
  constructor(
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: { userId: string; email: string; password: string }) {
    assertPasswordPolicy(input.password, input.email);
    const existing = await this.credentials.findByEmail(input.email);
    if (existing) throw new DomainError('El correo ya está registrado', 'EMAIL_TAKEN');
    const byUser = await this.credentials.findByUserId(input.userId);
    if (byUser) throw new DomainError('El usuario ya tiene credencial', 'EMAIL_TAKEN');
    const credential = Credential.create({
      id: randomUUID(),
      userId: input.userId,
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
    });
    await this.credentials.save(credential);
    return { userId: credential.userId, email: credential.emailAddress };
  }
}

@Injectable()
export class ChangeCredentialEmailUseCase {
  constructor(@Inject(CREDENTIALS) private readonly credentials: CredentialRepository) {}

  async execute(input: { userId: string; email: string }) {
    const credential = await this.credentials.findByUserId(input.userId);
    if (!credential) throw new DomainError('Credencial no encontrada', 'NOT_FOUND');
    const taken = await this.credentials.findByEmail(input.email);
    if (taken && taken.userId !== input.userId) throw new DomainError('El correo ya está registrado', 'EMAIL_TAKEN');
    credential.changeEmail(input.email);
    await this.credentials.save(credential);
    return { userId: credential.userId, email: credential.emailAddress };
  }
}

@Injectable()
export class DisableCredentialUseCase {
  constructor(
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(SESSIONS) private readonly sessions: SessionStore,
  ) {}

  async execute(userId: string) {
    const credential = await this.credentials.findByUserId(userId);
    if (!credential || credential.state === 'DISABLED') return { disabled: true, idempotent: true };
    credential.disable();
    await this.credentials.save(credential);
    await this.sessions.revoke(userId);
    return { disabled: true, idempotent: false };
  }
}

@Injectable()
export class DeleteCredentialUseCase {
  constructor(
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(SESSIONS) private readonly sessions: SessionStore,
  ) {}

  async execute(userId: string) {
    await this.sessions.revoke(userId);
    await this.credentials.deleteByUserId(userId);
    return { deleted: true };
  }
}
