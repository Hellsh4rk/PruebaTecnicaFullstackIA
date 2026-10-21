import { Injectable } from '@nestjs/common';
import { AccessSnapshot, RedisKeys } from '@toka/contracts';
import { RedisClient } from '@toka/platform';
import { AccessCache } from '../../application/ports';

@Injectable()
export class RedisAccessCache implements AccessCache {
  constructor(private readonly redis: RedisClient) {}

  async remember(snapshot: AccessSnapshot): Promise<void> {
    await this.redis.set(RedisKeys.access(snapshot.userId), JSON.stringify(snapshot));
  }

  async bump(userId: string): Promise<void> {
    await this.redis.incr(RedisKeys.tokenVersion(userId));
  }
}
