import { percentile } from '@toka/platform';

export class MetricsStore {
  private readonly latencies: number[] = [];
  private readonly costs: number[] = [];

  constructor(private readonly capacity = 500) {}

  record(latencyMs: number, costUsd: number): void {
    this.latencies.push(latencyMs);
    this.costs.push(costUsd);
    if (this.latencies.length > this.capacity) this.latencies.shift();
    if (this.costs.length > this.capacity) this.costs.shift();
  }

  snapshot(circuit: string) {
    const avg = this.costs.length ? this.costs.reduce((sum, value) => sum + value, 0) / this.costs.length : 0;
    return {
      samples: this.latencies.length,
      p95Ms: percentile(this.latencies, 95),
      p99Ms: percentile(this.latencies, 99),
      avgCostUsd: Number(avg.toFixed(8)),
      circuit,
    };
  }
}
