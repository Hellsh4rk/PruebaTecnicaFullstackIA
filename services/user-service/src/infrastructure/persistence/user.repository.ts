import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JsonLogger } from '@toka/platform';
import { likeTerm, User } from '../../domain/user';
import { RequestMeta, UserRepository } from '../../application/ports';
import { UserOrm } from './entities';
import { OutboxService } from './outbox.service';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  private readonly logger = new JsonLogger(process.env.SERVICE_NAME ?? 'user-service');

  constructor(
    @InjectRepository(UserOrm) private readonly rows: Repository<UserOrm>,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.rows.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.rows.findOne({ where: { email: email.trim().toLowerCase() } });
    return row ? this.toDomain(row) : null;
  }

  async search(input: { search?: string; page: number; limit: number }) {
    const query = this.rows.createQueryBuilder('user').orderBy('user.createdAt', 'DESC');
    if (input.search?.trim()) {
      query.where(`user.email ILIKE :search ESCAPE '\\' OR user.fullName ILIKE :search ESCAPE '\\'`, {
        search: likeTerm(input.search),
      });
    }
    query.skip((input.page - 1) * input.limit).take(input.limit);
    const [rows, total] = await query.getManyAndCount();
    return { items: rows.map((row) => this.toDomain(row)), total };
  }

  async save(user: User, meta: RequestMeta): Promise<void> {
    const events = user.peekEvents();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(UserOrm, this.toOrm(user));
      for (const event of events) await this.outbox.append(manager, event, meta);
    });
    user.pullEvents();
    await this.flushQuietly();
  }

  async remove(user: User, meta: RequestMeta): Promise<void> {
    const events = user.peekEvents();
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserOrm, { id: user.id });
      for (const event of events) await this.outbox.append(manager, event, meta);
    });
    user.pullEvents();
    await this.flushQuietly();
  }

  private async flushQuietly(): Promise<void> {
    try {
      await this.outbox.flush();
    } catch (error) {
      this.logger.error('outbox_inline_flush_failed', error instanceof Error ? error.message : undefined);
    }
  }

  private toDomain(row: UserOrm): User {
    return User.rehydrate({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toOrm(user: User): UserOrm {
    const json = user.toJSON();
    const row = new UserOrm();
    row.id = json.id;
    row.email = json.email;
    row.fullName = json.fullName;
    row.status = json.status;
    row.createdAt = new Date(json.createdAt);
    row.updatedAt = new Date(json.updatedAt);
    return row;
  }
}
