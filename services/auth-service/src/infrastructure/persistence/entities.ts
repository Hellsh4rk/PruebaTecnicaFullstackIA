import { DomainEventEnvelope } from '@toka/contracts';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('credentials')
export class CredentialOrm {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { unique: true })
  userId!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: 'ACTIVE' })
  status!: 'ACTIVE' | 'DISABLED';
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
