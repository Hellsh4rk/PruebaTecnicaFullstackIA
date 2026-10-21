import { User } from '../domain/user';

export interface RequestMeta {
  correlationId: string;
  traceId: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  search(input: { search?: string; page: number; limit: number }): Promise<{ items: User[]; total: number }>;
  save(user: User, meta: RequestMeta): Promise<void>;
  remove(user: User, meta: RequestMeta): Promise<void>;
}

export const USERS = Symbol('USERS');
