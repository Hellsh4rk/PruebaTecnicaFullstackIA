import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AmqpClient, CircuitBreaker, HealthController, InternalAuthGuard, JsonLogger, PermissionsGuard } from '@toka/platform';
import { AI_AUDIT, KNOWLEDGE, MODELS } from './application/ports';
import { IngestKnowledgeUseCase, QueryKnowledgeUseCase } from './application/ai.usecases';
import { MetricsStore } from './domain/metrics';
import { AiBootstrap } from './infrastructure/bootstrap';
import { OpenAiClient } from './infrastructure/openai/openai.client';
import { AiController } from './infrastructure/http/ai.controller';
import { RabbitAiAudit } from './infrastructure/messaging/ai-audit';
import { QdrantKnowledgeBase } from './infrastructure/qdrant/qdrant.store';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AiController, HealthController],
  providers: [
    QueryKnowledgeUseCase,
    IngestKnowledgeUseCase,
    AiBootstrap,
    RabbitAiAudit,
    InternalAuthGuard,
    PermissionsGuard,
    { provide: MetricsStore, useFactory: () => new MetricsStore() },
    {
      provide: CircuitBreaker,
      useFactory: () => new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 15000 }),
    },
    { provide: JsonLogger, useFactory: () => new JsonLogger(process.env.SERVICE_NAME ?? 'ai-agent-service') },
    { provide: AmqpClient, useFactory: () => new AmqpClient(new JsonLogger(process.env.SERVICE_NAME ?? 'ai-agent-service')) },
    { provide: OpenAiClient, inject: [ConfigService], useFactory: (config: ConfigService) => new OpenAiClient(config) },
    { provide: MODELS, useExisting: OpenAiClient },
    { provide: QdrantKnowledgeBase, inject: [ConfigService], useFactory: (config: ConfigService) => new QdrantKnowledgeBase(config) },
    { provide: KNOWLEDGE, useExisting: QdrantKnowledgeBase },
    { provide: AI_AUDIT, useExisting: RabbitAiAudit },
  ],
})
export class AppModule {}
