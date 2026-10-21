import { DomainEventEnvelope } from '@toka/contracts';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserOrm {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  fullName!: string;

  @Column({ default: 'ACTIVE' })
  status!: 'ACTIVE' | 'INACTIVE';

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
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
