import { Injectable } from '@nestjs/common';
import { Response } from 'express';

export interface UpstreamResult {
  status: number;
  text: string;
}

@Injectable()
export class ServiceProxy {
  async request(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: unknown; timeoutMs?: number },
  ): Promise<UpstreamResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000);
    try {
      const response = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      return { status: response.status, text: await response.text() };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        status: aborted ? 504 : 503,
        text: JSON.stringify({
          message: aborted ? 'Tiempo de espera agotado' : 'Servicio no disponible',
          code: aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
        }),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function writeUpstream(response: Response, upstream: UpstreamResult): void {
  response.status(upstream.status);
  try {
    response.json(upstream.text ? JSON.parse(upstream.text) : {});
  } catch {
    response.json({ message: upstream.text || 'Respuesta vacía', code: 'UPSTREAM' });
  }
}
