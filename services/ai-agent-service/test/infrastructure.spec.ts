const mockEmbed = jest.fn();
const mockGenerate = jest.fn();
const mockQdrant = {
  getCollection: jest.fn(),
  createCollection: jest.fn(),
  count: jest.fn(),
  query: jest.fn(),
  upsert: jest.fn(),
};

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    embeddings: { create: mockEmbed },
    chat: { completions: { create: mockGenerate } },
  })),
}));

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => mockQdrant),
}));

import { ConfigService } from '@nestjs/config';
import { CircuitBreaker } from '@toka/platform';
import { OpenAiClient } from '../src/infrastructure/openai/openai.client';
import { QdrantKnowledgeBase } from '../src/infrastructure/qdrant/qdrant.store';
import { AiController } from '../src/infrastructure/http/ai.controller';
import { RabbitAiAudit } from '../src/infrastructure/messaging/ai-audit';
import { MetricsStore } from '../src/domain/metrics';
import { STARTER_KNOWLEDGE } from '../src/infrastructure/knowledge';
import '../src/app.module';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!values[key]) throw new Error(key);
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('OpenAI, Qdrant y el borde HTTP', () => {
  beforeEach(() => {
    mockEmbed.mockReset();
    mockGenerate.mockReset();
    mockQdrant.getCollection.mockReset();
    mockQdrant.createCollection.mockReset();
    mockQdrant.count.mockReset();
    mockQdrant.query.mockReset();
    mockQdrant.upsert.mockReset();
  });

  it('embebe, genera y rechaza una clave ausente', async () => {
    const vector = Array.from({ length: 768 }, () => 0.1);
    mockEmbed.mockResolvedValue({ data: [{ embedding: vector }], usage: { prompt_tokens: 4 } });
    mockGenerate.mockResolvedValue({
      choices: [{ message: { content: '{"answer":"ok","refused":false}' } }],
      usage: { prompt_tokens: 8, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 1 } },
    });
    const client = new OpenAiClient(config({ OPENAI_API_KEY: 'key', OPENAI_EMBED_MODEL: 'text-embedding-004', OPENAI_BASE_URL: 'https://api.openai.com/v1' }));
    await expect(client.embed('texto')).resolves.toMatchObject({ tokens: 4 });
    await expect(client.generate('pregunta')).resolves.toMatchObject({ promptTokens: 8, candidateTokens: 3, thoughtTokens: 1 });
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({ max_completion_tokens: 2000, reasoning_effort: 'low' });
    mockEmbed.mockResolvedValueOnce({ data: [{ embedding: [] }], usage: { prompt_tokens: 1 } });
    await expect(client.embed('vacío')).rejects.toThrow('Embedding vacío');
    mockEmbed.mockResolvedValueOnce({ data: [{ embedding: [1] }], usage: { prompt_tokens: 1 } });
    await expect(client.embed('corto')).rejects.toThrow('Dimensión');
    const gateway = new OpenAiClient(config({ OPENAI_BASE_URL: 'https://opencode.ai/inference/openai/v1' }));
    await expect(gateway.embed('x')).rejects.toThrow('EMBEDDINGS_UNSUPPORTED');
    await expect(gateway.generate('pregunta')).resolves.toMatchObject({ promptTokens: 8 });
    expect(mockGenerate.mock.calls.at(-1)?.[0].response_format).toBeUndefined();
    const offline = new OpenAiClient(config({ OPENAI_BASE_URL: 'https://api.openai.com/v1' }));
    await expect(offline.embed('x')).rejects.toThrow('OPENAI_NOT_CONFIGURED');
    mockEmbed.mockRejectedValueOnce({ status: 429, message: 'rate limit' });
    await expect(client.embed('limit')).rejects.toThrow('429');
  });

  it('crea la colección, busca y hace upsert', async () => {
    const store = new QdrantKnowledgeBase(config({ QDRANT_URL: 'http://qdrant:6333' }));
    mockQdrant.getCollection.mockRejectedValueOnce(new Error('missing'));
    await store.ensure();
    mockQdrant.getCollection.mockResolvedValueOnce({});
    await store.ensure();
    expect(mockQdrant.createCollection).toHaveBeenCalledTimes(1);
    mockQdrant.count.mockResolvedValue({ count: 4 });
    await expect(store.count()).resolves.toBe(4);
    mockQdrant.query.mockResolvedValue({
      points: [{ score: 0.8, payload: {} }, { payload: { title: 't', text: 'x', source: 's' } }],
    });
    await expect(store.search([0.1], 2)).resolves.toEqual([
      { title: 'sin título', text: '', source: 'desconocido', score: 0.8 },
      { title: 't', text: 'x', source: 's', score: 0 },
    ]);
    await store.upsert([{ id: '1', vector: [0.1], title: 't', text: 'x', source: 's' }]);
    expect(mockQdrant.upsert).toHaveBeenCalled();
    expect(STARTER_KNOWLEDGE.length).toBeGreaterThan(0);
  });

  it('publica la consulta y expone métricas', async () => {
    const query = { execute: jest.fn().mockResolvedValue({ answer: 'ok' }) };
    const ingest = { execute: jest.fn() };
    const metrics = new MetricsStore();
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
    const http = new AiController(query as never, ingest as never, metrics, breaker);
    const request = { correlationId: 'c', traceId: 't' };
    await http.query({ question: '¿y el rol?' }, 'u1', ' ADMIN, OPERATOR ', request as never);
    await http.query({ question: 'otra' }, undefined, undefined, request as never);
    expect(query.execute).toHaveBeenCalledWith(expect.objectContaining({ roles: ['ADMIN', 'OPERATOR'] }));
    await http.ingest({ title: 'Manual', text: 'texto', source: 'manual' });
    expect(http.metricsSnapshot().circuit).toBe('closed');
    expect(http.ready().service).toBe('ai-agent-service');

    const amqp = { connect: jest.fn(), publish: jest.fn().mockResolvedValue(undefined) };
    const audit = new RabbitAiAudit(amqp as never, config({ RABBITMQ_URL: 'amqp://localhost' }));
    await audit.record({ userId: 'u1', degraded: true }, { correlationId: 'c', traceId: 't' });
    expect(amqp.publish).not.toHaveBeenCalled();
    await audit.connect();
    await audit.record({ userId: 'u1', degraded: true }, { correlationId: 'c', traceId: 't' });
    expect(amqp.publish).toHaveBeenCalled();
  });
});
