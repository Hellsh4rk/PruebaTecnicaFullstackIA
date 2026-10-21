import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Credential } from '../../domain/credential';
import { CredentialRepository } from '../../application/ports';
import { CredentialOrm } from './entities';

@Injectable()
export class TypeOrmCredentialRepository implements CredentialRepository {
  constructor(@InjectRepository(CredentialOrm) private readonly rows: Repository<CredentialOrm>) {}

  async findByEmail(email: string): Promise<Credential | null> {
    const row = await this.rows.findOne({ where: { email: email.trim().toLowerCase() } });
    return row ? this.toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<Credential | null> {
    const row = await this.rows.findOne({ where: { userId } });
    return row ? this.toDomain(row) : null;
  }

  async save(credential: Credential): Promise<void> {
    await this.rows.save(this.toOrm(credential));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.rows.delete({ userId });
  }

  private toDomain(row: CredentialOrm): Credential {
    return Credential.rehydrate({
      id: row.id,
      userId: row.userId,
      email: row.email,
      passwordHash: row.passwordHash,
      status: row.status,
    });
  }

  private toOrm(credential: Credential): CredentialOrm {
    const row = new CredentialOrm();
    row.id = credential.id;
    row.userId = credential.userId;
    row.email = credential.emailAddress;
    row.passwordHash = credential.hash;
    row.status = credential.state;
    return row;
  }
}
