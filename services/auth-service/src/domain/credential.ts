import { DomainError } from '@toka/platform';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (!EMAIL.test(value) || value.length > 180) {
      throw new DomainError('Correo inválido', 'VALIDATION');
    }
    return new Email(value);
  }
}

export function assertPasswordPolicy(password: string, email?: string): void {
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(password)) {
    throw new DomainError('La contraseña debe tener 8-72 caracteres, con mayúscula, minúscula y número', 'VALIDATION');
  }
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
    throw new DomainError('La contraseña no puede contener el correo', 'VALIDATION');
  }
}

export class Credential {
  private constructor(
    readonly id: string,
    readonly userId: string,
    private email: Email,
    private passwordHash: string,
    private status: 'ACTIVE' | 'DISABLED',
  ) {}

  static create(input: { id: string; userId: string; email: string; passwordHash: string }): Credential {
    return new Credential(input.id, input.userId, Email.create(input.email), input.passwordHash, 'ACTIVE');
  }

  static rehydrate(input: {
    id: string;
    userId: string;
    email: string;
    passwordHash: string;
    status: 'ACTIVE' | 'DISABLED';
  }): Credential {
    return new Credential(input.id, input.userId, Email.create(input.email), input.passwordHash, input.status);
  }

  ensureActive(): void {
    if (this.status !== 'ACTIVE') throw new DomainError('La cuenta está deshabilitada', 'INACTIVE_USER');
  }

  disable(): void {
    this.status = 'DISABLED';
  }

  changeEmail(email: string): void {
    this.email = Email.create(email);
  }

  get hash(): string {
    return this.passwordHash;
  }

  get emailAddress(): string {
    return this.email.value;
  }

  get state(): 'ACTIVE' | 'DISABLED' {
    return this.status;
  }
}
