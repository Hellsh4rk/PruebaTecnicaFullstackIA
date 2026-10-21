import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { CircuitBreaker, CircuitOpenError, DomainError, retry } from '@toka/platform';
import { chunkText, embeddingsSupported, estimateCostUsd, resolveBaseUrl, TokenUsage } from '../domain/cost';
import { MetricsStore } from '../domain/metrics';
import { buildPrompt, detectInjection, parseModelAnswer } from '../domain/prompt';
import { AI_AUDIT, AiAudit, KNOWLEDGE, KnowledgeBase, MODELS, LanguageModel } from './ports';

export interface AiAnswer {
  answer: string;
  refused: boolean;
  degraded: boolean;
  reason?: string;
  sources: Array<{ title: string; source: string; score: number }>;
  metrics: {
    embeddingMs: number;
    inferenceMs: number;
    totalMs: number;
    promptTokens: number;
    candidateTokens: number;
    thoughtTokens: number;
    embeddingTokens: number;
    costUsd: number;
  };
}

@Injectable()
export class QueryKnowledgeUseCase {
  constructor(
    @Inject(KNOWLEDGE) private readonly knowledge: KnowledgeBase,
    @Inject(MODELS) private readonly models: LanguageModel,
    @Inject(AI_AUDIT) private readonly audit: AiAudit,
    private readonly metrics: MetricsStore,
    private readonly breaker: CircuitBreaker,
    private readonly config: ConfigService,
  ) {}

  async execute(input: { question: string; userId: string; roles: string[]; correlationId: string; traceId: string }): Promise<AiAnswer> {
    const started = Date.now();
    if (detectInjection(input.question)) {
      const answer = this.finish(started, emptyUsage(), 'No puedo atender instrucciones que intentan alterar mis reglas.', true, false, 'prompt_injection', []);
      await this.auditSafe(input, answer);
      return answer;
    }
    if (!chatConfigured(this.config)) {
      const answer = this.finish(started, emptyUsage(), 'Falta la clave de OpenAI en OPENAI_API_KEY. El resto de la consola sigue disponible.', false, true, 'not_configured', []);
      await this.auditSafe(input, answer);
      return answer;
    }

    try {
      const embedStarted = Date.now();
      const embedding = await this.protectedCall(async () => {
        try {
          return await this.models.embed(input.question);
        } catch (error) {
          if (isEmbeddingsUnsupported(error)) return null;
          throw error;
        }
      });
      const embeddingMs = embedding ? Date.now() - embedStarted : 0;
      let hits: Awaited<ReturnType<KnowledgeBase['search']>> = [];
      let contextDegraded = !embedding;
      if (embedding) {
        try {
          hits = await this.knowledge.search(embedding.vector, 4);
        } catch {
          contextDegraded = true;
        }
      }
      const genStarted = Date.now();
      const generation = await this.protectedCall(() =>
        this.models.generate(buildPrompt({ question: input.question, hits, roles: input.roles, contextDegraded })),
      );
      const parsed = parseModelAnswer(generation.raw);
      const usage: TokenUsage = {
        promptTokens: generation.promptTokens,
        candidateTokens: generation.candidateTokens,
        thoughtTokens: generation.thoughtTokens,
        embeddingTokens: embedding?.tokens ?? 0,
      };
      const answer = this.finish(started, usage, parsed.answer, parsed.refused, contextDegraded, contextDegraded ? 'context_degraded' : undefined, hits, embeddingMs, Date.now() - genStarted);
      await this.auditSafe(input, answer);
      return answer;
    } catch (error) {
      const reason = classify(error);
      const answer = this.finish(started, emptyUsage(), degradedCopy(reason), false, true, reason, []);
      await this.auditSafe(input, answer);
      return answer;
    }
  }

  private async protectedCall<T>(action: () => Promise<T>): Promise<T> {
    return this.breaker.execute(() =>
      retry(action, {
        attempts: 3,
        baseDelayMs: 200,
        shouldRetry: (error) => isRetryable(error),
      }),
    );
  }

  private finish(
    started: number,
    usage: TokenUsage,
    answer: string,
    refused: boolean,
    degraded: boolean,
    reason: string | undefined,
    hits: Array<{ title: string; source: string; score: number }>,
    embeddingMs = 0,
    inferenceMs = 0,
  ): AiAnswer {
    const totalMs = Date.now() - started;
    const costUsd = estimateCostUsd(usage, {
      inputPerMillion: numberEnv(this.config.get('OPENAI_INPUT_USD_PER_MILLION'), 0.05),
      outputPerMillion: numberEnv(this.config.get('OPENAI_OUTPUT_USD_PER_MILLION'), 0.4),
      embeddingPerMillion: numberEnv(this.config.get('OPENAI_EMBED_USD_PER_MILLION'), 0.02),
    });
    this.metrics.record(totalMs, costUsd);
    return {
      answer,
      refused,
      degraded,
      reason,
      sources: hits.map((hit) => ({ title: hit.title, source: hit.source, score: hit.score })),
      metrics: {
        embeddingMs,
        inferenceMs,
        totalMs,
        promptTokens: usage.promptTokens,
        candidateTokens: usage.candidateTokens,
        thoughtTokens: usage.thoughtTokens,
        embeddingTokens: usage.embeddingTokens,
        costUsd,
      },
    };
  }

  private async auditSafe(input: { question: string; userId: string; correlationId: string; traceId: string }, answer: AiAnswer) {
    try {
      await this.audit.record(
        {
          userId: input.userId,
          question: input.question.slice(0, 200),
          degraded: answer.degraded,
          refused: answer.refused,
          reason: answer.reason ?? null,
          totalMs: answer.metrics.totalMs,
          costUsd: answer.metrics.costUsd,
          promptTokens: answer.metrics.promptTokens,
          candidateTokens: answer.metrics.candidateTokens,
        },
        input,
      );
    } catch {
      return;
    }
  }
}

@Injectable()
export class IngestKnowledgeUseCase {
  constructor(
    @Inject(KNOWLEDGE) private readonly knowledge: KnowledgeBase,
    @Inject(MODELS) private readonly models: LanguageModel,
    private readonly breaker: CircuitBreaker,
    private readonly config: ConfigService,
  ) {}

  async execute(input: { title: string; text: string; source: string }) {
    if (!embeddingsSupported(resolveBaseUrl(this.config.get<string>('OPENAI_BASE_URL')))) {
      throw new DomainError('Este gateway no ofrece embeddings. La ingesta a Qdrant queda desactivada.', 'PROVIDER_UNAVAILABLE');
    }
    if (!this.config.get<string>('OPENAI_API_KEY')) {
      throw new DomainError('El modelo no está configurado', 'PROVIDER_UNAVAILABLE');
    }
    const chunks = chunkText(input.text);
    if (chunks.length === 0) throw new DomainError('El texto está vacío', 'VALIDATION');
    let tokens = 0;
    const points = [];
    for (const chunk of chunks) {
      const embedding = await this.breaker.execute(() => this.models.embed(`${input.title}\n${chunk}`));
      tokens += embedding.tokens;
      points.push({ id: randomUUID(), vector: embedding.vector, title: input.title, text: chunk, source: input.source });
    }
    await this.knowledge.upsert(points);
    return { chunks: points.length, embeddingTokens: tokens };
  }
}

function chatConfigured(config: ConfigService): boolean {
  return Boolean(config.get<string>('OPENAI_API_KEY'));
}

export function isEmbeddingsUnsupported(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('EMBEDDINGS_UNSUPPORTED');
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, candidateTokens: 0, thoughtTokens: 0, embeddingTokens: 0 };
}

function numberEnv(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false;
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /429|RESOURCE_EXHAUSTED|UNAVAILABLE|TIMEOUT|503|500|ECONNRESET|ETIMEDOUT|fetch failed/i.test(text);
}

export function classify(error: unknown): string {
  if (error instanceof CircuitOpenError) return 'circuit_open';
  const text = error instanceof Error ? error.message : String(error);
  if (/429|RESOURCE_EXHAUSTED/i.test(text)) return 'rate_limited';
  if (/TIMEOUT/i.test(text)) return 'timeout';
  return 'provider_error';
}

function degradedCopy(reason: string): string {
  if (reason === 'rate_limited') return 'El proveedor aplicó rate limit (HTTP 429). Reintenta en unos segundos; la consola operativa no se detiene.';
  if (reason === 'timeout') return 'La llamada al modelo excedió el tiempo límite. Reduce la pregunta o reintenta. El resto de los servicios sigue activo.';
  if (reason === 'circuit_open') return 'El asistente está en circuito abierto para proteger al resto de la plataforma. Inténtalo de nuevo en unos segundos.';
  return 'El asistente no pudo completar la consulta. La operación de usuarios, roles y auditoría no se ve afectada.';
}
