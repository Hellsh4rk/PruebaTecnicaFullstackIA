import type { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      traceId: string;
      user?: {
        sub: string;
        email: string;
        roles: string[];
        permissions: string[];
        tv: number;
        jti: string;
        iat: number;
        exp: number;
      };
    }
  }
}

export type CorrelatedRequest = Request;
