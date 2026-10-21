export interface TokenUsage {
  promptTokens: number;
  candidateTokens: number;
  thoughtTokens: number;
  embeddingTokens: number;
}

export interface CostRates {
  inputPerMillion: number;
  outputPerMillion: number;
  embeddingPerMillion: number;
}

export function estimateCostUsd(usage: TokenUsage, rates: CostRates): number {
  const input = (usage.promptTokens / 1_000_000) * rates.inputPerMillion;
  const output = ((usage.candidateTokens + usage.thoughtTokens) / 1_000_000) * rates.outputPerMillion;
  const embedding = (usage.embeddingTokens / 1_000_000) * rates.embeddingPerMillion;
  return Number((input + output + embedding).toFixed(8));
}

export function chunkText(text: string, size = 700, overlap = 80): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let index = 0;
  while (index < clean.length) {
    chunks.push(clean.slice(index, index + size));
    if (index + size >= clean.length) break;
    index += size - overlap;
  }
  return chunks;
}

const RETIRED_EMBED_MODELS = new Set(['text-embedding-004', 'embedding-001', 'gemini-embedding-2']);

export const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';
export const DEFAULT_CHAT_MODEL = 'gpt-5-nano';
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export function resolveBaseUrl(configured: string | undefined): string {
  return configured?.trim() || DEFAULT_BASE_URL;
}

export function embeddingsSupported(baseURL: string): boolean {
  return /api\.openai\.com/i.test(baseURL);
}

export function resolveEmbedModel(configured: string | undefined): { model: string; replacedLegacy: boolean } {
  const model = configured?.trim() || DEFAULT_EMBED_MODEL;
  if (RETIRED_EMBED_MODELS.has(model)) {
    return { model: DEFAULT_EMBED_MODEL, replacedLegacy: true };
  }
  return { model, replacedLegacy: false };
}
