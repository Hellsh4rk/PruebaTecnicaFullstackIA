import { DomainEventEnvelope } from '@toka/contracts';
import { Column, Entity, JoinTable, ManyToMany, PrimaryColumn, Unique } from 'typeorm';

@Entity('permissions')
export class PermissionOrm {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  code!: string;

  @Column()
  description!: string;
}

@Entity('roles')
export class RoleOrm {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  description!: string;

  @ManyToMany(() => PermissionOrm, { eager: true })
  @JoinTable({ name: 'role_permissions' })
  permissions!: PermissionOrm[];
}

@Entity('role_assignments')
@Unique(['userId', 'roleId'])
export class AssignmentOrm {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  roleId!: string;

  @Column({ type: 'timestamptz' })
  assignedAt!: Date;
}

@Entity('outbox_events')
export class OutboxOrm {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  routingKey!: string;

  @Column({ type: 'jsonb' })
  body!: DomainEventEnvelope;

  @Column({ type: 'jsonb' })
  headers!: Record<string, string>;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
