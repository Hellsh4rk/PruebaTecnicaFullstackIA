import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import { PageFrame, PageHero } from '../components/Brand';
import { EmptyState, SkeletonRows } from '../components/States';

interface AuditRow {
  eventId: string;
  type: string;
  aggregateId: string;
  correlationId: string;
  occurredAt: string;
}

export function AuditPage() {
  const [type, setType] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(filter = type) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filter.trim()) params.set('type', filter.trim());
      const query = params.toString();
      const page = await api<{ data: AuditRow[] }>(`/api/audit${query ? `?${query}` : ''}`);
      setRows(page.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Auditoría no disponible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('');
  }, []);

  return (
    <section>
      <PageHero title="Auditoría" lede="Bitácora append-only. Cada evento conserva el correlation id que cruzó el gateway." />
      <PageFrame>
        <form
          className="flex gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void load();
          }}
        >
          <input value={type} onChange={(event) => setType(event.target.value)} placeholder="user.created" className="field mt-0 max-w-xs" />
          <button className="btn-line">Filtrar</button>
        </form>
        <div className="mt-6">
          {loading && <SkeletonRows />}
          {!loading && error && <EmptyState title="Sin traza" detail={error} />}
          {!loading && !error && rows.length === 0 && <EmptyState title="Todavía no hay eventos" detail="Inicia sesión o crea un usuario para poblar Mongo." />}
          {!loading && !error && rows.length > 0 && (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.eventId} className="rounded-3xl border border-line bg-white px-5 py-4 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="rounded-full bg-sea/10 px-3 py-1 text-xs font-semibold text-sea">{row.type}</p>
                    <p className="text-xs text-ink/45">{new Date(row.occurredAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-3 text-xs text-ink/60">correlation {row.correlationId || '—'} · agregado {row.aggregateId}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageFrame>
    </section>
  );
}
