import { Inject, Injectable } from '@nestjs/common';
import { RoutingKeys } from '@toka/contracts';
import { DomainError, JsonLogger } from '@toka/platform';
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
export class LoginUseCase {
  constructor(
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(HASHER) private readonly hasher: PasswordHasher,
    @Inject(ACCESS) private readonly access: AccessDirectory,
    @Inject(TOKENS) private readonly tokens: TokenIssuer,
    @Inject(SESSIONS) private readonly sessions: SessionStore,
    @Inject(AUDIT) private readonly audit: AuthAudit,
  ) {}

  async execute(input: { email: string; password: string } & RequestMeta) {
    const credential = await this.credentials.findByEmail(input.email.trim().toLowerCase());
    if (!credential) throw new DomainError('Credenciales inválidas', 'INVALID_CREDENTIALS');
    credential.ensureActive();
    const matches = await this.hasher.verify(input.password, credential.hash);
    if (!matches) throw new DomainError('Credenciales inválidas', 'INVALID_CREDENTIALS');

    const snapshot = await this.access.resolve(credential.userId);
    const tokenVersion = await this.access.beginSession(credential.userId);
    const issued = this.tokens.issue({
      userId: credential.userId,
      email: credential.emailAddress,
      roles: snapshot.roles,
      permissions: snapshot.permissions,
      tokenVersion,
    });
    const refreshToken = this.tokens.issueRefresh(credential.userId);
    await this.sessions.saveRefresh(credential.userId, refreshToken, issued.jti, credential.emailAddress);
    await this.safeAudit(RoutingKeys.AuthLoggedIn, credential.userId, { email: credential.emailAddress }, input);

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

  private async safeAudit(type: string, aggregateId: string, payload: Record<string, unknown>, meta: RequestMeta) {
    try {
      await this.audit.record(type, aggregateId, payload, meta);
    } catch (error) {
      new JsonLogger(process.env.SERVICE_NAME ?? 'auth-service').error(
        'audit_best_effort_failed',
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}

