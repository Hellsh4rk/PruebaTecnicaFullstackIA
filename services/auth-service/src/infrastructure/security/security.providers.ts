import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtMeta, RedisKeys } from '@toka/contracts';
import { DomainError, RedisClient, safeEqual } from '@toka/platform';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AccessDirectory, PasswordHasher, SessionStore, TokenIssuer } from '../../application/ports';

@Injectable()
export class BcryptHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

@Injectable()
export class JwtTokenService implements TokenIssuer {
  constructor(private readonly config: ConfigService) {}

  issue(input: {
    userId: string;
    email: string;
    roles: string[];
    permissions: string[];
    tokenVersion: number;
  }) {
    const expiresIn = Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
    const jti = randomUUID();
    const accessToken = jwt.sign(
      {
        sub: input.userId,
        email: input.email,
        roles: input.roles,
        permissions: input.permissions,
        tv: input.tokenVersion,
        jti,
      },
      this.secret(),
      { expiresIn, issuer: JwtMeta.issuer, audience: JwtMeta.audience },
    );
    return { accessToken, expiresIn, jti };
  }

  issueRefresh(userId: string): string {
    const expiresIn = Number(this.config.get('JWT_REFRESH_TTL_SECONDS') ?? 604800);
    return jwt.sign({ sub: userId, typ: 'refresh' }, this.secret(), {
      expiresIn,
      issuer: JwtMeta.issuer,
      audience: JwtMeta.audience,
      jwtid: randomUUID(),
    });
  }

  verify(token: string) {
    const claims = jwt.verify(token, this.secret(), {
      issuer: JwtMeta.issuer,
      audience: JwtMeta.audience,
    }) as { sub: string; email: string; jti: string; exp: number; typ?: string };
    if (claims.typ === 'refresh' || !claims.jti) throw new DomainError('Token inválido', 'UNAUTHORIZED');
    return { sub: claims.sub, email: claims.email, jti: claims.jti, exp: claims.exp };
  }

  verifyRefresh(token: string) {
    const claims = jwt.verify(token, this.secret(), {
      issuer: JwtMeta.issuer,
      audience: JwtMeta.audience,
    }) as { sub: string; typ?: string };
    if (claims.typ !== 'refresh') throw new DomainError('Token inválido', 'UNAUTHORIZED');
    return { sub: claims.sub };
  }

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }
}

@Injectable()
export class RedisAccessDirectory implements AccessDirectory {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: ConfigService,
  ) {}

  async resolve(userId: string) {
    const cached = await this.redis.get(RedisKeys.access(userId));
    if (cached) return JSON.parse(cached) as Awaited<ReturnType<AccessDirectory['resolve']>>;
    const response = await fetch(`${this.config.getOrThrow<string>('ROLE_SERVICE_URL')}/internal/users/${userId}/access`, {
      headers: { 'x-internal-token': this.config.getOrThrow<string>('INTERNAL_TOKEN') },
    });
    if (!response.ok) throw new DomainError('No se pudieron resolver los permisos', 'AUTHZ_UNAVAILABLE');
    const snapshot = (await response.json()) as Awaited<ReturnType<AccessDirectory['resolve']>>;
    await this.redis.set(RedisKeys.access(userId), JSON.stringify(snapshot));
    return snapshot;
  }

  async beginSession(userId: string): Promise<number> {
    await this.redis.del(RedisKeys.refresh(userId), RedisKeys.session(userId));
    return this.redis.incr(RedisKeys.tokenVersion(userId));
  }

  async currentVersion(userId: string): Promise<number> {
    const value = await this.redis.get(RedisKeys.tokenVersion(userId));
    if (value) return Number(value);
    await this.redis.set(RedisKeys.tokenVersion(userId), '1');
    return 1;
  }
}

@Injectable()
export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: ConfigService,
  ) {}

  async saveRefresh(userId: string, refreshToken: string, jti: string, email: string): Promise<void> {
    const ttl = Number(this.config.get('JWT_REFRESH_TTL_SECONDS') ?? 604800);
    await this.redis.set(RedisKeys.refresh(userId), JSON.stringify({ hash: sha256(refreshToken) }), ttl);
    await this.redis.set(RedisKeys.session(userId), JSON.stringify({ jti, email, at: new Date().toISOString() }), ttl);
  }

  async assertRefresh(userId: string, refreshToken: string): Promise<void> {
    const raw = await this.redis.get(RedisKeys.refresh(userId));
    const presented = sha256(refreshToken);
    const stored = raw ? (JSON.parse(raw) as { hash: string }).hash : '';
    if (!stored || !safeEqual(stored, presented)) {
      await this.revoke(userId);
      throw new DomainError('Sesión inválida', 'UNAUTHORIZED');
    }
  }

  async revoke(userId: string): Promise<void> {
    await this.redis.del(RedisKeys.refresh(userId), RedisKeys.session(userId));
    await this.redis.incr(RedisKeys.tokenVersion(userId));
  }

  async blacklist(jti: string, exp: number): Promise<void> {
    const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 1);
    await this.redis.set(RedisKeys.blacklist(jti), '1', ttl);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
