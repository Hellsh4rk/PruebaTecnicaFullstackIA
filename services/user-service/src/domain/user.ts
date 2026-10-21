import { randomUUID } from 'crypto';
import { DomainEventEnvelope, RoutingKeys } from '@toka/contracts';
import { DomainError } from '@toka/platform';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (!EMAIL.test(value) || value.length > 180) throw new DomainError('Correo inválido', 'VALIDATION');
    return new Email(value);
  }
}

export class FullName {
  private constructor(readonly value: string) {}

  static create(raw: string): FullName {
    const value = raw.replace(/[\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim();
    if (value.length < 2 || value.length > 120) {
      throw new DomainError('El nombre debe tener entre 2 y 120 caracteres', 'VALIDATION');
    }
    return new FullName(value);
  }
}

export function likeTerm(raw: string): string {
  return `%${raw.trim().replace(/[\\%_]/g, '\\$&')}%`;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export class User {
  private readonly pending: DomainEventEnvelope[] = [];

  private constructor(
    readonly id: string,
    private email: Email,
    private fullName: FullName,
    private status: UserStatus,
    readonly createdAt: Date,
    private updatedAt: Date,
  ) {}

  static create(input: { id: string; email: string; fullName: string; now?: Date }): User {
    const now = input.now ?? new Date();
    const user = new User(input.id, Email.create(input.email), FullName.create(input.fullName), 'ACTIVE', now, now);
    user.record(RoutingKeys.UserCreated, {
      email: user.email.value,
      fullName: user.fullName.value,
      status: user.status,
    });
    return user;
  }

  static rehydrate(input: {
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User(input.id, Email.create(input.email), FullName.create(input.fullName), input.status, input.createdAt, input.updatedAt);
  }

  rename(fullName: string): void {
    const next = FullName.create(fullName);
    if (next.value === this.fullName.value) return;
    this.fullName = next;
    this.record(RoutingKeys.UserUpdated, this.snapshot());
  }

  changeEmail(email: string): void {
    const next = Email.create(email);
    if (next.value === this.email.value) return;
    this.email = next;
    this.record(RoutingKeys.UserUpdated, this.snapshot());
  }

  deactivate(reason = 'admin'): void {
    if (this.status === 'INACTIVE') throw new DomainError('El usuario ya está inactivo', 'VALIDATION');
    this.status = 'INACTIVE';
    this.record(RoutingKeys.UserDeactivated, { reason, email: this.email.value });
  }

  peekEvents(): DomainEventEnvelope[] {
    return [...this.pending];
  }

  pullEvents(): DomainEventEnvelope[] {
    const events = [...this.pending];
    this.pending.length = 0;
    return events;
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email.value,
      fullName: this.fullName.value,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  private snapshot() {
    return { email: this.email.value, fullName: this.fullName.value, status: this.status };
  }

  private record(type: string, payload: Record<string, unknown>): void {
    this.updatedAt = new Date();
    this.pending.push({
      eventId: randomUUID(),
      type,
      aggregateId: this.id,
      occurredAt: this.updatedAt.toISOString(),
      payload,
    });
  }
}
