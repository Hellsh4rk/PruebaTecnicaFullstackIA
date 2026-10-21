import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DomainEventEnvelope, RoutingKeys } from '@toka/contracts';
import { AmqpClient } from '@toka/platform';
import { DisableCredentialUseCase, ChangeCredentialEmailUseCase } from '../../application/session.usecases';

@Injectable()
export class AuthConsumer {
  constructor(
    private readonly amqp: AmqpClient,
    private readonly disableCredential: DisableCredentialUseCase,
    private readonly changeEmail: ChangeCredentialEmailUseCase,
  ) {}

  async start(): Promise<void> {
    await this.amqp.consume('auth.identity', ['user.deactivated', 'user.updated'], async (message) => {
      const envelope = message as DomainEventEnvelope<{ email?: string; reason?: string }>;
      if (!envelope.aggregateId) throw new Error('Evento sin aggregateId');
      if (envelope.type === RoutingKeys.UserDeactivated) {
        await this.disableCredential.execute(envelope.aggregateId);
        return;
      }
      if (envelope.type === RoutingKeys.UserUpdated && envelope.payload.email) {
        await this.changeEmail.execute({ userId: envelope.aggregateId, email: envelope.payload.email });
      }
    });
  }
}

export function auditEnvelope(type: string, aggregateId: string, payload: Record<string, unknown>): DomainEventEnvelope {
  return {
    eventId: randomUUID(),
    type,
    aggregateId,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
