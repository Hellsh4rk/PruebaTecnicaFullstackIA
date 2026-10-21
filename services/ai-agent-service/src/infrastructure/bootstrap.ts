import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpClient, JsonLogger } from '@toka/platform';
import { KNOWLEDGE, KnowledgeBase } from '../application/ports';
import { IngestKnowledgeUseCase } from '../application/ai.usecases';
import { embeddingsSupported, resolveBaseUrl } from '../domain/cost';
import { STARTER_KNOWLEDGE } from './knowledge';
import { RabbitAiAudit } from './messaging/ai-audit';

@Injectable()
export class AiBootstrap implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new JsonLogger(process.env.SERVICE_NAME ?? 'ai-agent-service');

  constructor(
    private readonly config: ConfigService,
    private readonly amqp: AmqpClient,
    private readonly audit: RabbitAiAudit,
    @Inject(KNOWLEDGE) private readonly knowledge: KnowledgeBase,
    private readonly ingest: IngestKnowledgeUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.audit.connect();
    } catch (error) {
      this.logger.error('ai_bus_unavailable', error instanceof Error ? error.message : undefined);
    }
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      try {
        await this.knowledge.ensure();
        break;
      } catch (error) {
        this.logger.warn(`qdrant_not_ready_${attempt}`);
        if (attempt === 15) {
          this.logger.error('qdrant_unavailable', error instanceof Error ? error.message : undefined);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!this.config.get<string>('OPENAI_API_KEY')) {
      this.logger.warn('model_api_key_missing');
      if (embeddingsSupported(resolveBaseUrl(this.config.get<string>('OPENAI_BASE_URL')))) return;
    }
    try {
      const count = await this.knowledge.count();
      if (count > 0) return;
      for (const document of STARTER_KNOWLEDGE) {
        await this.ingest.execute(document);
      }
      this.logger.event('knowledge_seeded', { documents: STARTER_KNOWLEDGE.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      if (message?.includes('embeddings')) {
        this.logger.warn('embeddings_unavailable_skip_seed');
        return;
      }
      this.logger.error('knowledge_seed_failed', message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.amqp.close();
  }
}
