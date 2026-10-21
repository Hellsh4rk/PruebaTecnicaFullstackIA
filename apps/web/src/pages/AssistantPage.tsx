import { FormEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, api } from '../api/client';
import { PageFrame, PageHero } from '../components/Brand';
import { assistantSchema } from '../schemas/user';
import { useUi } from '../store/ui';

interface AiResponse {
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
    costUsd: number;
  };
}

export function AssistantPage() {
  const push = useUi((state) => state.push);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [metrics, setMetrics] = useState<string>('');
  const form = useForm<{ question: string }>({ resolver: zodResolver(assistantSchema), defaultValues: { question: '' } });

  async function onSubmit(values: { question: string }) {
    try {
      const answer = await api<AiResponse>('/api/ai/query', { method: 'POST', body: JSON.stringify(values) });
      setResult(answer);
      const snapshot = await api<Record<string, unknown>>('/api/ai/metrics');
      setMetrics(`p95 ${snapshot.p95Ms} ms · p99 ${snapshot.p99Ms} ms · circuito ${snapshot.circuit}`);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'El asistente no respondió', 'error');
    }
  }

  return (
    <section>
      <PageHero title="Asistente" lede="Responde con el contexto de Qdrant cuando hay embeddings. Si el modelo limita o se abre el circuito, la consola sigue operando." />
      <PageFrame>
        <div className="max-w-3xl">
          <form onSubmit={form.handleSubmit(onSubmit) as (event: FormEvent) => void} className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-card">
            <textarea className="field mt-0 min-h-32" placeholder="¿Qué puede hacer el rol OPERATOR?" {...form.register('question')} />
            {form.formState.errors.question && <p className="text-xs text-clay">{form.formState.errors.question.message}</p>}
            <button className="btn-navy">Consultar</button>
          </form>
          {result && (
            <article className="mt-6 rounded-3xl border border-line bg-white p-6 shadow-card">
              {result.degraded && <p className="mb-3 rounded-2xl bg-[#fdecee] px-3 py-2 text-sm font-medium text-clay">Degradado: {result.reason}</p>}
              <p className="whitespace-pre-wrap leading-7">{result.answer}</p>
              {result.sources.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs text-ink/55">
                  {result.sources.map((source) => (
                    <li key={`${source.title}-${source.score}`}>
                      {source.title} · {source.source} · {source.score.toFixed(3)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-ink/45">
                embed {result.metrics.embeddingMs} ms · inferencia {result.metrics.inferenceMs} ms · prompt {result.metrics.promptTokens} · salida {result.metrics.candidateTokens} · ${result.metrics.costUsd}
              </p>
              {metrics && <p className="mt-1 text-xs text-ink/45">{metrics}</p>}
            </article>
          )}
        </div>
      </PageFrame>
    </section>
  );
}
