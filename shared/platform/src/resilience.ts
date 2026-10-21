export class CircuitOpenError extends Error {
  constructor() {
    super('Circuito abierto');
    this.name = 'CircuitOpenError';
  }
}

export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = false;

  constructor(
    private readonly options: {
      failureThreshold: number;
      resetTimeoutMs: number;
      now?: () => number;
    },
  ) {}

  async execute<T>(action: () => Promise<T>): Promise<T> {
    const now = this.options.now ?? Date.now;
    if (this.state === 'open') {
      if (now() - this.openedAt < this.options.resetTimeoutMs) {
        throw new CircuitOpenError();
      }
      this.state = 'half_open';
    }

    if (this.state === 'half_open' && this.halfOpenInFlight) {
      throw new CircuitOpenError();
    }
    if (this.state === 'half_open') this.halfOpenInFlight = true;

    try {
      const result = await action();
      this.failures = 0;
      this.state = 'closed';
      this.halfOpenInFlight = false;
      return result;
    } catch (error) {
      this.halfOpenInFlight = false;
      this.failures += 1;
      if (this.state === 'half_open' || this.failures >= this.options.failureThreshold) {
        this.state = 'open';
        this.openedAt = now();
      }
      throw error;
    }
  }

  snapshot(): { state: CircuitState; failures: number } {
    return { state: this.state, failures: this.failures };
  }
}

export async function retry<T>(
  action: () => Promise<T>,
  options: {
    attempts: number;
    baseDelayMs: number;
    shouldRetry: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const exhausted = attempt === options.attempts;
      if (exhausted || !options.shouldRetry(error)) throw error;
      const delay = options.baseDelayMs * 2 ** (attempt - 1);
      await (options.sleep ?? delayMs)(delay);
    }
  }
  throw lastError;
}

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout<T>(action: Promise<T>, ms: number, label = 'TIMEOUT'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    action.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
}

export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const currentTime = this.now();
    const bucket = this.hits.get(key);
    if (!bucket || bucket.resetAt <= currentTime) {
      this.hits.set(key, { count: 1, resetAt: currentTime + this.windowMs });
      return true;
    }
    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }
}
