import { AccessSnapshot } from '@toka/contracts';
import { Credential } from '../domain/credential';

export interface RequestMeta {
  correlationId: string;
  traceId: string;
}

export interface CredentialRepository {
  findByEmail(email: string): Promise<Credential | null>;
  findByUserId(userId: string): Promise<Credential | null>;
  save(credential: Credential): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface IssuedAccess {
  accessToken: string;
  expiresIn: number;
  jti: string;
}

export interface TokenIssuer {
  issue(input: {
    userId: string;
    email: string;
    roles: string[];
    permissions: string[];
    tokenVersion: number;
  }): IssuedAccess;
  issueRefresh(userId: string): string;
  verify(token: string): { sub: string; email: string; jti: string; exp: number };
  verifyRefresh(token: string): { sub: string };
}

export interface AccessDirectory {
  resolve(userId: string): Promise<AccessSnapshot>;
  beginSession(userId: string): Promise<number>;
  currentVersion(userId: string): Promise<number>;
}

export interface SessionStore {
  saveRefresh(userId: string, refreshToken: string, jti: string, email: string): Promise<void>;
  assertRefresh(userId: string, refreshToken: string): Promise<void>;
  revoke(userId: string): Promise<void>;
  blacklist(jti: string, exp: number): Promise<void>;
}

export interface AuthAudit {
  record(type: string, aggregateId: string, payload: Record<string, unknown>, meta: RequestMeta): Promise<void>;
}

export const CREDENTIALS = Symbol('CREDENTIALS');
export const HASHER = Symbol('HASHER');
export const TOKENS = Symbol('TOKENS');
export const ACCESS = Symbol('ACCESS');
export const SESSIONS = Symbol('SESSIONS');
export const AUDIT = Symbol('AUDIT');
