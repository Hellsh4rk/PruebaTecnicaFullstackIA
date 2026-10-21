import { LoggerService } from '@nestjs/common';

export class JsonLogger implements LoggerService {
  constructor(private readonly service: string) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  event(message: string, fields: Record<string, unknown> = {}): void {
    this.write('info', message, undefined, undefined, fields);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    trace?: string,
    fields?: Record<string, unknown>,
  ): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      context,
      message: typeof message === 'string' ? message : safeStringify(message),
      trace,
      ...fields,
    };
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(payload)}\n`);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const SECRET_KEY = /password|token|secret|authorization|api[-_]?key/i;

export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitize(nested);
    }
    return output;
  }
  return value;
}
