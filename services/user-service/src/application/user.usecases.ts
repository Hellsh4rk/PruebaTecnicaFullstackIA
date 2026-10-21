import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '@toka/platform';
import { User } from '../domain/user';
import { RequestMeta, USERS, UserRepository } from './ports';

function pageOf(page?: number, limit?: number) {
  return {
    page: Math.max(1, page || 1),
    limit: Math.min(100, Math.max(1, limit || 20)),
  };
}

@Injectable()
export class CreateUserUseCase {
  constructor(@Inject(USERS) private readonly users: UserRepository) {}

  async execute(input: { id: string; email: string; fullName: string } & RequestMeta) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new DomainError('El correo ya está registrado', 'EMAIL_TAKEN');
    const user = User.create({ id: input.id, email: input.email, fullName: input.fullName });
    await this.users.save(user, input);
    return user.toJSON();
  }
}

@Injectable()
export class UpdateUserUseCase {
  constructor(@Inject(USERS) private readonly users: UserRepository) {}

  async execute(input: { id: string; email?: string; fullName?: string } & RequestMeta) {
    const user = await this.require(input.id);
    if (input.fullName) user.rename(input.fullName);
    if (input.email) {
      const taken = await this.users.findByEmail(input.email);
      if (taken && taken.id !== user.id) throw new DomainError('El correo ya está registrado', 'EMAIL_TAKEN');
      user.changeEmail(input.email);
    }
    await this.users.save(user, input);
    return user.toJSON();
  }

  private async require(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new DomainError('Usuario no encontrado', 'NOT_FOUND');
    return user;
  }
}

@Injectable()
export class GetUserUseCase {
  constructor(@Inject(USERS) private readonly users: UserRepository) {}

  async execute(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new DomainError('Usuario no encontrado', 'NOT_FOUND');
    return user.toJSON();
  }
}

@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USERS) private readonly users: UserRepository) {}

  async execute(input: { search?: string; page?: number; limit?: number }) {
    const paging = pageOf(input.page, input.limit);
    const result = await this.users.search({ search: input.search, ...paging });
    return { data: result.items.map((user) => user.toJSON()), total: result.total, ...paging };
  }
}

@Injectable()
export class DeactivateUserUseCase {
  constructor(@Inject(USERS) private readonly users: UserRepository) {}

  async execute(input: { id: string } & RequestMeta) {
    const user = await this.users.findById(input.id);
    if (!user) throw new DomainError('Usuario no encontrado', 'NOT_FOUND');
    user.deactivate('admin');
    await this.users.save(user, input);
    return user.toJSON();
  }
}

@Injectable()
export class RemoveUserUseCase {
  constructor(@Inject(USERS) private readonly users: UserRepository) {}

  async execute(input: { id: string } & RequestMeta) {
    const user = await this.users.findById(input.id);
    if (!user) return { removed: false };
    if (user.toJSON().status === 'ACTIVE') user.deactivate('compensation');
    await this.users.remove(user, input);
    return { removed: true };
  }
}
