import { CircuitBreaker, CircuitOpenError, FixedWindowLimiter, percentile, retry } from '../src/resilience';
import { sanitize } from '../src/logger';
import { statusForDomainCode } from '../src/errors';

describe('CircuitBreaker', () => {
  it('abre el circuito al superar el umbral y lo deja pasar tras el timeout', async () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 500, now: () => now });
    await expect(breaker.execute(async () => Promise.reject(new Error('fallo')))).rejects.toThrow('fallo');
    await expect(breaker.execute(async () => Promise.reject(new Error('fallo')))).rejects.toThrow('fallo');
    expect(breaker.snapshot().state).toBe('open');
    await expect(breaker.execute(async () => 'ok')).rejects.toBeInstanceOf(CircuitOpenError);
    now = 1_600;
    await expect(breaker.execute(async () => 'recuperado')).resolves.toBe('recuperado');
    expect(breaker.snapshot().state).toBe('closed');
  });
});

describe('retry', () => {
  it('reintenta con backoff y luego devuelve el valor', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const value = await retry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('temporal');
        return 'listo';
      },
      {
        attempts: 3,
        baseDelayMs: 10,
        shouldRetry: () => true,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(value).toBe('listo');
    expect(sleeps).toEqual([10, 20]);
  });

  it('no reintenta errores no recuperables', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls += 1;
          throw new Error('fatal');
        },
        { attempts: 3, baseDelayMs: 5, shouldRetry: () => false, sleep: async () => undefined },
      ),
    ).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });
});

describe('percentile', () => {
  it('calcula p95 sobre la muestra ordenada', () => {
    const samples = [10, 20, 30, 40, 100];
    expect(percentile(samples, 95)).toBe(100);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('FixedWindowLimiter', () => {
  it('bloquea cuando la ventana se agota', () => {
    let now = 1_000;
    const limiter = new FixedWindowLimiter(2, 1_000, () => now);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
    now = 2_100;
    expect(limiter.allow('ip')).toBe(true);
  });
});

describe('sanitize', () => {
  it('redacta secretos anidados', () => {
    expect(sanitize({ email: 'a@b.com', password: 'x', nested: { accessToken: 'jwt' } })).toEqual({
      email: 'a@b.com',
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]' },
    });
  });
});

describe('statusForDomainCode', () => {
  it('mapea conflictos y credenciales', () => {
    expect(statusForDomainCode('EMAIL_TAKEN')).toBe(409);
    expect(statusForDomainCode('INVALID_CREDENTIALS')).toBe(401);
    expect(statusForDomainCode('DESCONOCIDO')).toBe(400);
  });
});
