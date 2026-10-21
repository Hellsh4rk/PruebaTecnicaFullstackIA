import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoleSeed } from '@toka/contracts';
import { JsonLogger } from '@toka/platform';
import { DataSource, In, Repository } from 'typeorm';
import { projectAccess, RoleView } from '../../domain/access';
import { RequestMeta, RoleRepository } from '../../application/ports';
import { AssignmentOrm, PermissionOrm, RoleOrm } from './entities';
import { OutboxService } from './outbox.service';

@Injectable()
export class TypeOrmRoleRepository implements RoleRepository {
  private readonly logger = new JsonLogger(process.env.SERVICE_NAME ?? 'role-service');

  constructor(
    @InjectRepository(RoleOrm) private readonly roles: Repository<RoleOrm>,
    @InjectRepository(PermissionOrm) private readonly permissions: Repository<PermissionOrm>,
    @InjectRepository(AssignmentOrm) private readonly assignments: Repository<AssignmentOrm>,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async list(): Promise<RoleView[]> {
    const rows = await this.roles.find({ order: { name: 'ASC' } });
    return rows.map((row) => this.toView(row));
  }

  async findById(id: string): Promise<RoleView | null> {
    const row = await this.roles.findOne({ where: { id } });
    return row ? this.toView(row) : null;
  }

  async ensureCatalog(catalog: RoleSeed[]): Promise<void> {
    for (const role of catalog) {
      for (const code of role.permissions) {
        const found = await this.permissions.findOne({ where: { code } });
        if (!found) {
          await this.permissions.save(this.permissions.create({ id: randomUUID(), code, description: code }));
        }
      }
      const permissions = await this.permissions.find({ where: { code: In([...role.permissions]) } });
      const existing = await this.roles.findOne({ where: { id: role.id } });
      if (!existing) {
        const created = new RoleOrm();
        created.id = role.id;
        created.name = role.name;
        created.description = role.description;
        created.permissions = permissions;
        await this.roles.save(created);
      } else {
        existing.description = role.description;
        existing.permissions = permissions;
        await this.roles.save(existing);
      }
    }
  }

  async hasAssignment(userId: string, roleId: string): Promise<boolean> {
    const row = await this.assignments.findOne({ where: { userId, roleId } });
    return Boolean(row);
  }

  async assign(
    input: { id: string; userId: string; roleId: string; event: import('@toka/contracts').DomainEventEnvelope },
    meta: RequestMeta,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const row = new AssignmentOrm();
      row.id = input.id;
      row.userId = input.userId;
      row.roleId = input.roleId;
      row.assignedAt = new Date();
      await manager.save(row);
      await this.outbox.append(manager, input.event, meta);
    });
    await this.flushQuietly();
  }

  async revoke(
    input: { userId: string; roleId: string; event: import('@toka/contracts').DomainEventEnvelope },
    meta: RequestMeta,
  ): Promise<boolean> {
    const existing = await this.assignments.findOne({ where: { userId: input.userId, roleId: input.roleId } });
    if (!existing) return false;
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AssignmentOrm, { id: existing.id });
      await this.outbox.append(manager, input.event, meta);
    });
    await this.flushQuietly();
    return true;
  }

  async accessFor(userId: string) {
    const assignments = await this.assignments.find({ where: { userId } });
    if (assignments.length === 0) return projectAccess(userId, []);
    const roles = await this.roles.find({ where: { id: In(assignments.map((row) => row.roleId)) } });
    return projectAccess(userId, roles.map((role) => this.toView(role)));
  }

  private toView(row: RoleOrm): RoleView {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: [...row.permissions.map((permission) => permission.code)].sort(),
    };
  }

  private async flushQuietly(): Promise<void> {
    try {
      await this.outbox.flush();
    } catch (error) {
      this.logger.error('outbox_inline_flush_failed', error instanceof Error ? error.message : undefined);
    }
  }
}
