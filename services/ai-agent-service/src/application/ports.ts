export interface RetrievedChunk {
  title: string;
  text: string;
  source: string;
  score: number;
}

export interface KnowledgeBase {
  ensure(): Promise<void>;
  count(): Promise<number>;
  search(vector: number[], limit: number): Promise<RetrievedChunk[]>;
  upsert(points: Array<{ id: string; vector: number[]; title: string; text: string; source: string }>): Promise<void>;
}

export interface Embedding {
  vector: number[];
  tokens: number;
}

export interface Generation {
  raw: string;
  promptTokens: number;
  candidateTokens: number;
  thoughtTokens: number;
}

export interface LanguageModel {
  embed(text: string): Promise<Embedding>;
  generate(userPrompt: string): Promise<Generation>;
}

export interface AiAudit {
  record(payload: Record<string, unknown>, meta: { correlationId: string; traceId: string }): Promise<void>;
}

export const KNOWLEDGE = Symbol('KNOWLEDGE');
export const MODELS = Symbol('MODELS');
export const AI_AUDIT = Symbol('AI_AUDIT');
