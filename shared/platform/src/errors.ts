export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  INACTIVE_USER: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  ALREADY_ASSIGNED: 409,
  ASSIGNMENT_NOT_FOUND: 404,
  AUTHZ_UNAVAILABLE: 503,
  PROVIDER_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
};

export function statusForDomainCode(code: string): number {
  return STATUS_BY_CODE[code] ?? 400;
}
