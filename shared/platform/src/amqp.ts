import amqp, { type Channel, type ConsumeMessage } from 'amqplib';
import { DomainEventEnvelope, Messaging } from '@toka/contracts';
import { JsonLogger } from './logger';

export type AmqpHandler = (
  message: DomainEventEnvelope,
  headers: Record<string, unknown>,
  routingKey: string,
) => Promise<void>;

export interface OutboxMessage {
  id: string;
  routingKey: string;
  body: unknown;
  headers: Record<string, string>;
}

export class AmqpClient {
  private connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
  private channel: Channel | null = null;

  constructor(private readonly logger: JsonLogger) {}

  async connect(url: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(Messaging.exchange, 'topic', { durable: true });
        await this.channel.assertExchange(Messaging.dlx, 'topic', { durable: true });
        this.connection.on('error', (error: unknown) => {
          this.logger.error('amqp_connection_error', error instanceof Error ? error.stack : undefined);
        });
        this.logger.event('amqp_connected', { attempt });
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`amqp_connect_retry_${attempt}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    throw lastError;
  }

  async publish(routingKey: string, body: unknown, headers: Record<string, string>): Promise<void> {
    if (!this.channel) throw new Error('AMQP no conectado');
    const channel = this.channel;
    const accepted = channel.publish(Messaging.exchange, routingKey, Buffer.from(JSON.stringify(body)), {
      persistent: true,
      contentType: 'application/json',
      messageId: headers.eventId,
      headers,
      timestamp: Date.now(),
    });
    if (!accepted) {
      await new Promise((resolve) => channel.once('drain', () => resolve(undefined)));
    }
  }

  async consume(queue: string, patterns: string[], handler: AmqpHandler): Promise<void> {
    if (!this.channel) throw new Error('AMQP no conectado');
    const channel = this.channel;
    const deadLetterQueue = `${queue}.dlq`;
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, Messaging.dlx, `${queue}.dead`);
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': Messaging.dlx,
        'x-dead-letter-routing-key': `${queue}.dead`,
      },
    });
    for (const pattern of patterns) {
      await channel.bindQueue(queue, Messaging.exchange, pattern);
    }
    await channel.prefetch(10);
    await channel.consume(queue, (message: ConsumeMessage | null) => {
      if (!message) return;
      void this.handleMessage(channel, message, handler);
    });
    this.logger.event('amqp_consumer_ready', { queue, patterns });
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage, handler: AmqpHandler): Promise<void> {
    try {
      const body = JSON.parse(message.content.toString()) as DomainEventEnvelope;
      await handler(body, (message.properties.headers ?? {}) as Record<string, unknown>, message.fields.routingKey);
      channel.ack(message);
    } catch (error) {
      this.logger.error('amqp_message_rejected', error instanceof Error ? error.stack : undefined, 'consumer');
      channel.nack(message, false, false);
    }
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = null;
    this.connection = null;
  }
}

export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly amqp: AmqpClient,
    private readonly logger: JsonLogger,
  ) {}

  async publishPending(messages: OutboxMessage[], markPublished: (id: string) => Promise<void>): Promise<void> {
    for (const message of messages) {
      await this.amqp.publish(message.routingKey, message.body, message.headers);
      await markPublished(message.id);
    }
  }

  start(load: () => Promise<OutboxMessage[]>, markPublished: (id: string) => Promise<void>, intervalMs = 2000): void {
    const tick = async () => {
      try {
        const batch = await load();
        if (batch.length > 0) await this.publishPending(batch, markPublished);
      } catch (error) {
        this.logger.error('outbox_flush_failed', error instanceof Error ? error.message : undefined);
      }
    };
    this.timer = setInterval(() => void tick(), intervalMs);
    void tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
