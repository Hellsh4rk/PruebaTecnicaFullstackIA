import { randomUUID, timingSafeEqual } from 'crypto';
import type { NextFunction, Response } from 'express';
import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { CorrelatedRequest } from './express';
import { DomainError, statusForDomainCode } from './errors';
import { JsonLogger } from './logger';

export function correlationMiddleware(req: CorrelatedRequest, res: Response, next: NextFunction): void {
  const incoming = req.header('x-correlation-id');
  const correlationId = incoming && incoming.length > 0 && incoming.length <= 80 ? incoming : randomUUID();
  const traceHeader = req.header('x-trace-id');
  const traceId = traceHeader && traceHeader.length > 0 && traceHeader.length <= 80 ? traceHeader : correlationId;
  req.correlationId = correlationId;
  req.traceId = traceId;
  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-trace-id', traceId);
  next();
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: JsonLogger;

  constructor(service: string) {
    this.logger = new JsonLogger(service);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<CorrelatedRequest>();
    const res = http.getResponse<Response>();
    if (req.path === '/health' || req.path === '/ready' || req.path.endsWith('/health') || req.path.endsWith('/ready')) {
      return next.handle();
    }
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.event('http_request', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - started,
            correlationId: req.correlationId,
            traceId: req.traceId,
          });
        },
        error: () => {
          this.logger.event('http_request_failed', {
            method: req.method,
            path: req.path,
            durationMs: Date.now() - started,
            correlationId: req.correlationId,
            traceId: req.traceId,
          });
        },
      }),
    );
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger: JsonLogger;

  constructor(service: string) {
    this.logger = new JsonLogger(service);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<CorrelatedRequest>();
    const mapped = mapException(exception);
    if (mapped.status >= 500) {
      this.logger.error(mapped.message, exception instanceof Error ? exception.stack : undefined, 'exception');
    }
    response.status(mapped.status).json({
      message: mapped.message,
      code: mapped.code,
      correlationId: request.correlationId,
    });
  }
}

function mapException(exception: unknown): { status: number; message: string; code: string } {
  if (exception instanceof DomainError) {
    return { status: statusForDomainCode(exception.code), message: exception.message, code: exception.code };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === 'string') return { status, message: body, code: 'HTTP_ERROR' };
    const record = body as { message?: string | string[]; code?: string };
    const message = Array.isArray(record.message) ? record.message.join(', ') : record.message ?? exception.message;
    return { status, message, code: record.code ?? 'HTTP_ERROR' };
  }
  return { status: 500, message: 'Error interno', code: 'INTERNAL' };
}

export function configureHttp(app: any, service: string): void {
  app.use(correlationMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor(service));
  app.useGlobalFilters(new AllExceptionsFilter(service));
  app.enableShutdownHooks();
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
