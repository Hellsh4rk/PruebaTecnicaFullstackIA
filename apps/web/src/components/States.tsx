import { Component, ReactNode } from 'react';
import { useUi } from '../store/ui';

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-mist px-6 py-14 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink/65">{detail}</p>
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-2xl bg-mist" />
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismiss);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`rounded-2xl px-4 py-3 text-left text-sm font-medium text-white shadow-card ${toast.tone === 'error' ? 'bg-clay' : toast.tone === 'success' ? 'bg-sea' : 'bg-ink'}`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto mt-16 max-w-lg rounded-3xl border border-line bg-white p-8 shadow-card">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-clay">Error de interfaz</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Esta vista no pudo renderizarse</h1>
          <p className="mt-3 text-sm text-ink/70">{this.state.error.message}</p>
          <button className="btn-navy mt-6" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
