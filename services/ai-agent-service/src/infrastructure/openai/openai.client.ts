import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { JsonLogger, withTimeout } from '@toka/platform';
import { DEFAULT_CHAT_MODEL, embeddingsSupported, resolveBaseUrl, resolveEmbedModel } from '../../domain/cost';
import { SYSTEM_PROMPT } from '../../domain/prompt';
import { Generation, LanguageModel } from '../../application/ports';

@Injectable()
export class OpenAiClient implements LanguageModel {
  private readonly ai: OpenAI | null;
  private readonly chatModel: string;
  private readonly embedModel: string;
  private readonly dimensions: number;
  private readonly vectors: boolean;
  private readonly jsonMode: boolean;
  private readonly logger = new JsonLogger(process.env.SERVICE_NAME ?? 'ai-agent-service');

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY') ?? '';
    const baseURL = resolveBaseUrl(config.get<string>('OPENAI_BASE_URL'));
    this.vectors = embeddingsSupported(baseURL);
    this.jsonMode = this.vectors;
    this.ai = apiKey || !this.vectors ? new OpenAI({ apiKey: apiKey || 'unused', baseURL, maxRetries: 0, fetch: apiKey ? undefined : stripAuthorization }) : null;
    this.chatModel = config.get<string>('OPENAI_CHAT_MODEL') || DEFAULT_CHAT_MODEL;
    const resolved = resolveEmbedModel(config.get<string>('OPENAI_EMBED_MODEL'));
    this.embedModel = resolved.model;
    this.dimensions = Number(config.get('EMBED_DIMENSIONS') ?? 768);
    if (resolved.replacedLegacy) {
      this.logger.warn(`embedding_model_retired_using_${this.embedModel}`);
    }
    if (!this.vectors) {
      this.logger.warn('embeddings_unsupported_context_optional');
    }
  }

  async embed(text: string) {
    if (!this.vectors) throw new Error('EMBEDDINGS_UNSUPPORTED');
    const client = this.requireClient();
    const response = await withTimeout(
      this.call(
        client.embeddings.create({
          model: this.embedModel,
          input: text,
          dimensions: this.dimensions,
        }),
      ),
      8000,
      'EMBED_TIMEOUT',
    );
    const values = response.data[0]?.embedding;
    if (!values?.length) throw new Error('Embedding vacío');
    if (values.length !== this.dimensions) throw new Error(`Dimensión inesperada ${values.length}`);
    return { vector: values, tokens: response.usage?.prompt_tokens ?? Math.ceil(text.length / 4) };
  }

  async generate(userPrompt: string): Promise<Generation> {
    const client = this.requireClient();
    const response = await withTimeout(
      this.call(
        client.chat.completions.create({
          model: this.chatModel,
          ...(this.chatModel.startsWith('gpt-5')
            ? { max_completion_tokens: 2000, reasoning_effort: 'low' as const }
            : { temperature: 0.2, max_tokens: 700 }),
          ...(this.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      ),
      20000,
      'GENERATE_TIMEOUT',
    );
    const usage = response.usage;
    const reasoning = (usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)?.completion_tokens_details?.reasoning_tokens ?? 0;
    const completion = usage?.completion_tokens ?? 0;
    return {
      raw: response.choices[0]?.message?.content ?? '',
      promptTokens: usage?.prompt_tokens ?? 0,
      candidateTokens: Math.max(completion - reasoning, 0),
      thoughtTokens: reasoning,
    };
  }

  private requireClient(): OpenAI {
    if (!this.ai) throw new Error('OPENAI_NOT_CONFIGURED');
    return this.ai;
  }

  private async call<T>(action: Promise<T>): Promise<T> {
    try {
      return await action;
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
      if (status) {
        const message = error instanceof Error ? error.message : 'openai';
        throw new Error(`${status} ${message}`);
      }
      throw error;
    }
  }
}

function stripAuthorization(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.delete('Authorization');
  return fetch(input, { ...init, headers });
}
